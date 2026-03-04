import * as vscode from 'vscode';
import {
  applyDecorations,
  clearDecorations,
  disposeAllDecorationTypes,
  updateMappings,
} from './decorator/overlayDecorator';
import {
  extractSymbols,
  getOutputChannel,
  disposeOutputChannel,
  SUPPORTED_LANGUAGES,
} from './ast/symbolExtractor';
import { translateSymbols } from './llm/translator';
import { TranslationCache } from './cache/translationCache';
import { memoryCache } from './cache/lruMemoryCache';
import { RosettaInlayHintsProvider } from './ui/inlayHintsProvider';
import { RosettaHoverProvider } from './ui/hoverProvider';

// ─────────────────────────────────────────────────────────────────────────────
// モジュールスコープの状態
// ─────────────────────────────────────────────────────────────────────────────

/** 翻訳オーバーレイのON/OFF状態 */
let isEnabled = false;

/** ステータスバーアイテム */
let statusBarItem: vscode.StatusBarItem;

/** SQLiteキャッシュインスタンス（activate で初期化） */
let translationCache: TranslationCache | undefined;

/** デバウンス用タイマー（タイピング停止1秒後に再解析） */
let typingTimeout: NodeJS.Timeout | null = null;

/** Inlay Hints プロバイダー（対訳モード — フェーズ6メインモード） */
let inlayHintsProvider: RosettaInlayHintsProvider;

/** X-Ray Hover プロバイダー */
let hoverProvider: RosettaHoverProvider;

// ─────────────────────────────────────────────────────────────────────────────
// ステータスバー表示の更新
// ─────────────────────────────────────────────────────────────────────────────
function updateStatusBar(label?: string): void {
  if (isEnabled) {
    statusBarItem.text = label ?? '$(eye) Rosetta: ON';
    statusBarItem.tooltip = 'Rosetta Lens: オン（クリックでOFF）';
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  } else {
    statusBarItem.text = '$(eye-closed) Rosetta: OFF';
    statusBarItem.tooltip = 'Rosetta Lens: オフ（クリックでON）';
    statusBarItem.backgroundColor = undefined;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// フルパイプライン: 抽出 → 翻訳（キャッシュ経由） → 描画
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 指定エディタに対してフルパイプラインを実行する。
 *   1. AST/LSP でシンボルを抽出
 *   2. Gemini API（またはキャッシュ）で翻訳
 *   3. InlayHintsProvider + HoverProvider に反映
 *   4. overlayDecorator は没入モード用に残存（現在 no-op）
 */
async function runTranslationPipeline(editor: vscode.TextEditor): Promise<void> {
  const { document } = editor;
  if (!SUPPORTED_LANGUAGES.has(document.languageId)) return;

  updateStatusBar('$(sync~spin) Rosetta: 解析中...');

  try {
    // Step 1: シンボル抽出
    const symbols = await extractSymbols(document);
    if (symbols.length === 0) {
      // 没入モード用（現在 no-op）
      applyDecorations(editor);
      updateStatusBar();
      return;
    }

    updateStatusBar('$(sync~spin) Rosetta: 翻訳中...');

    // Step 2: Gemini で翻訳（キャッシュ優先）
    const translationMap = await translateSymbols(symbols, translationCache);

    // Step 3a: 没入モード用マッピング更新（現在 no-op）
    if (Object.keys(translationMap).length > 0) {
      updateMappings(translationMap);
    }
    // 没入モード用 Decoration 適用（現在 no-op）
    applyDecorations(editor);

    // Step 3b: Inlay Hints / Hover プロバイダーを更新（フェーズ6メイン）
    inlayHintsProvider.updateMappings(translationMap);
    hoverProvider.updateMappings(translationMap);

    const count = Object.keys(translationMap).length;
    updateStatusBar(`$(eye) Rosetta: ON (${count}件)`);
    getOutputChannel().appendLine(
      `[Rosetta Lens] パイプライン完了: ${count}件の翻訳をInlay Hintsで表示`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    getOutputChannel().appendLine(`[Rosetta Lens] パイプラインエラー: ${msg}`);
    applyDecorations(editor); // 没入モード用フォールバック（現在 no-op）
    updateStatusBar();
  }
}

/**
 * ドキュメントからアクティブエディタを取得してパイプラインを実行するラッパー。
 * debounce / onDidSaveTextDocument から呼ぶ。
 */
async function runPipelineForDocument(document: vscode.TextDocument): Promise<void> {
  const editor = vscode.window.visibleTextEditors.find(e => e.document === document);
  if (!editor) return;
  await runTranslationPipeline(editor);
}

// ─────────────────────────────────────────────────────────────────────────────
// activate
// ─────────────────────────────────────────────────────────────────────────────
export function activate(context: vscode.ExtensionContext): void {
  console.log('[Rosetta Lens] 拡張機能が起動しました');

  // ─── SQLiteキャッシュの初期化 ─────────────────────────────────────────────
  translationCache = new TranslationCache(context);

  // ─── Inlay Hints / Hover プロバイダーの初期化（フェーズ6） ───────────────
  inlayHintsProvider = new RosettaInlayHintsProvider();
  hoverProvider = new RosettaHoverProvider();

  // SUPPORTED_LANGUAGES の全言語に登録
  const languageFilters = [...SUPPORTED_LANGUAGES].map(lang => ({ language: lang }));

  context.subscriptions.push(
    vscode.languages.registerInlayHintsProvider(languageFilters, inlayHintsProvider)
  );
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(languageFilters, hoverProvider)
  );
  context.subscriptions.push(inlayHintsProvider);

  // ─── ステータスバーの初期化 ───────────────────────────────────────────────
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = 'rosetta-lens.toggle';
  updateStatusBar();
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // ─── トグルコマンド ───────────────────────────────────────────────────────
  const toggleCommand = vscode.commands.registerCommand('rosetta-lens.toggle', async () => {
    isEnabled = !isEnabled;

    if (isEnabled) {
      vscode.window.showInformationMessage('Rosetta Lens: 翻訳オーバーレイをONにしました');
      const editor = vscode.window.activeTextEditor;
      if (editor) await runTranslationPipeline(editor);
    } else {
      // タイマーも一緒にクリア
      if (typingTimeout) { clearTimeout(typingTimeout); typingTimeout = null; }
      // 没入モード用（現在 no-op）
      clearDecorations();
      // Inlay Hints / Hover をクリア
      inlayHintsProvider.clearMappings();
      hoverProvider.clearMappings();
      updateStatusBar();
      vscode.window.showInformationMessage('Rosetta Lens: 翻訳オーバーレイをOFFにしました');
    }
  });
  context.subscriptions.push(toggleCommand);

  // ─── シンボル抽出コマンド（デバッグ用） ──────────────────────────────────
  const extractCommand = vscode.commands.registerCommand(
    'rosetta-lens.extractSymbols',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('Rosetta Lens: アクティブなエディタがありません');
        return;
      }
      if (!SUPPORTED_LANGUAGES.has(editor.document.languageId)) {
        vscode.window.showWarningMessage(
          `Rosetta Lens: ${editor.document.languageId} は未対応です（TypeScript/JavaScript/Python のみ）`
        );
        return;
      }
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Rosetta Lens: シンボルを抽出中...', cancellable: false },
        async () => {
          const symbols = await extractSymbols(editor.document);
          getOutputChannel().show(true);
          vscode.window.showInformationMessage(
            `Rosetta Lens: ${symbols.length} 件のシンボルを抽出しました（Output Channel を確認）`
          );
        }
      );
    }
  );
  context.subscriptions.push(extractCommand);

  // ─── キャッシュクリアコマンド（フェーズ6） ───────────────────────────────
  const clearCacheCommand = vscode.commands.registerCommand(
    'rosetta-lens.clearCache',
    () => {
      translationCache?.clear();
      memoryCache.clear();
      vscode.window.showInformationMessage('Rosetta Lens: 翻訳キャッシュをクリアしました');
      getOutputChannel().appendLine('[Rosetta Lens] キャッシュをクリアしました（L1メモリ + L2 SQLite）');
    }
  );
  context.subscriptions.push(clearCacheCommand);

  // ─── 英語テキストコピーコマンド（フェーズ6 / 将来の没入モード向け） ─────
  const copyOriginalCommand = vscode.commands.registerTextEditorCommand(
    'rosetta-lens.copyOriginal',
    async (editor) => {
      const selection = editor.selection;
      if (selection.isEmpty) {
        vscode.window.showWarningMessage('Rosetta Lens: テキストを選択してからコピーしてください');
        return;
      }
      const originalText = editor.document.getText(selection);
      await vscode.env.clipboard.writeText(originalText);
      vscode.window.showInformationMessage('Rosetta Lens: 元の英語テキストをクリップボードにコピーしました');
    }
  );
  context.subscriptions.push(copyOriginalCommand);

  // ─── エディタ切り替え時: ONならパイプライン再実行 ────────────────────────
  const onEditorChange = vscode.window.onDidChangeActiveTextEditor(async editor => {
    if (!editor || !isEnabled) return;
    await runTranslationPipeline(editor);
  });
  context.subscriptions.push(onEditorChange);

  // ─── テキスト変更時: 1秒デバウンスで再解析 ──────────────────────────────
  const onDocChange = vscode.workspace.onDidChangeTextDocument(event => {
    if (!isEnabled || event.document.uri.scheme !== 'file') return;

    if (typingTimeout) { clearTimeout(typingTimeout); }

    typingTimeout = setTimeout(async () => {
      typingTimeout = null;
      vscode.window.setStatusBarMessage('$(sync~spin) Rosetta: 再解析中...', 2000);
      await runPipelineForDocument(event.document);
    }, 1000);
  });
  context.subscriptions.push(onDocChange);

  // ─── ファイル保存時: デバウンスをキャンセルして即時実行 ─────────────────
  const onDocSave = vscode.workspace.onDidSaveTextDocument(async document => {
    if (!isEnabled || document.uri.scheme !== 'file') return;
    if (!SUPPORTED_LANGUAGES.has(document.languageId)) return;

    if (typingTimeout) { clearTimeout(typingTimeout); typingTimeout = null; }
    await runPipelineForDocument(document);
  });
  context.subscriptions.push(onDocSave);

  console.log('[Rosetta Lens] 全コマンド・イベントリスナーを登録しました');
}

// ─────────────────────────────────────────────────────────────────────────────
// deactivate
// ─────────────────────────────────────────────────────────────────────────────
export function deactivate(): void {
  if (typingTimeout) { clearTimeout(typingTimeout); typingTimeout = null; }
  disposeAllDecorationTypes(); // 没入モード用（現在 no-op）
  disposeOutputChannel();
  translationCache?.dispose(); // SQLite DBコネクションをクローズ
  console.log('[Rosetta Lens] 拡張機能を終了しました');
}
