import * as vscode from 'vscode';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ExtractedSymbol } from '../ast/symbolExtractor';
import { getOutputChannel } from '../ast/symbolExtractor';
import { TranslationCache } from '../cache/translationCache';
import { memoryCache } from '../cache/lruMemoryCache';

// ─────────────────────────────────────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────────────────────────────────────

/** 1回のAPIバッチで送る最大シンボル数（コスト・レート制限対策） */
const BATCH_SIZE = 50;

/** デフォルトモデル（settings.json の rosettaLens.geminiModel で上書き可能） */
const DEFAULT_MODEL = 'gemini-2.5-flash-preview-04-17';

// ─────────────────────────────────────────────────────────────────────────────
// プロンプト設計
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `\
あなたはプログラミング初心者向けのコード解読アシスタントです。
提供された識別子名と、そのスコープ・前後コードの文脈から、直感的で短い日本語名（全角/半角問わず）を推論してください。

## 翻訳ルール
- boolean型変数・関数: 「〜か」形式（例: isActive → 有効状態か）
- 配列・リスト: 複数形の日本語（例: users → ユーザー一覧）
- getter: 「〜取得」形式（例: getUserById → ID指定ユーザー取得）
- 動詞+名詞の関数: 「名詞+動詞」の日本語順に変換（例: sendNotification → 通知送信）
- 翻訳できない・不要な識別子は省略してください（出力JSONに含めない）
- 翻訳結果は簡潔に。5〜8文字程度が理想

## 出力形式
{"元の識別子名": "日本語訳"} のJSONオブジェクトのみ返してください。
説明文・Markdown・コードブロック記法は一切含めないこと。`;

/**
 * シンボルリストからユーザープロンプトを生成する
 * snippetは先頭2行だけに絞ってトークン節約
 */
function buildUserPrompt(symbols: ExtractedSymbol[]): string {
  const items = symbols.map(s => ({
    name: s.name,
    kind: s.kind,
    scope: s.scope,
    snippet: s.snippet
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0)
      .slice(0, 2)
      .join(' | '),
  }));

  return `以下の識別子を日本語に翻訳してください:\n${JSON.stringify(items, null, 2)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// JSONパース（不正レスポンスへのフォールバック）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Geminiのレスポンステキストから翻訳マッピングをパースする。
 * responseMimeType: "application/json" でも稀にMarkdownが混じるため
 * 正規表現で中身を抽出するフォールバックを設ける。
 */
function parseTranslationResponse(
  raw: string
): Record<string, string> | null {
  // 1. そのままパース（正常系）
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isStringRecord(parsed)) return parsed;
  } catch {
    // 続行
  }

  // 2. Markdownコードブロックを除去して再試行
  const stripped = raw.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
  try {
    const parsed: unknown = JSON.parse(stripped);
    if (isStringRecord(parsed)) return parsed;
  } catch {
    // 続行
  }

  // 3. { ... } の最初のブロックを抽出して再試行
  const match = stripped.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed: unknown = JSON.parse(match[0]);
      if (isStringRecord(parsed)) return parsed;
    } catch {
      // 続行
    }
  }

  return null;
}

/** Record<string, string> かどうかを検証するタイプガード */
function isStringRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.values(value).every(v => typeof v === 'string');
}

// ─────────────────────────────────────────────────────────────────────────────
// VS Code 設定の取得
// ─────────────────────────────────────────────────────────────────────────────

function getConfig(): { apiKey: string; modelName: string } {
  const cfg = vscode.workspace.getConfiguration('rosettaLens');
  return {
    apiKey: cfg.get<string>('geminiApiKey', '').trim(),
    modelName: cfg.get<string>('geminiModel', DEFAULT_MODEL).trim() || DEFAULT_MODEL,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 公開API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ExtractedSymbol[] を Gemini API に送信し、翻訳マッピングを取得する。
 *
 * キャッシュ戦略（L1: メモリLRU / L2: SQLite）:
 *   1. L1 メモリキャッシュを確認
 *   2. L1 ミス → L2 SQLiteキャッシュを確認（L1に昇格）
 *   3. L2 ミス → Gemini API を呼び出し（バッチ最大50件）
 *   4. API 結果を L1 + L2 両方に保存
 */
export async function translateSymbols(
  symbols: ExtractedSymbol[],
  sqliteCache?: TranslationCache
): Promise<Record<string, string>> {
  const { apiKey, modelName } = getConfig();
  const ch = getOutputChannel();

  // ── APIキー未設定チェック ─────────────────────────────────────────────────
  if (!apiKey) {
    vscode.window
      .showErrorMessage(
        'Rosetta Lens: Gemini APIキーが設定されていません。',
        '設定を開く'
      )
      .then(action => {
        if (action === '設定を開く') {
          vscode.commands.executeCommand(
            'workbench.action.openSettings',
            'rosettaLens.geminiApiKey'
          );
        }
      });
    return {};
  }

  if (symbols.length === 0) return {};

  // ── キャッシュチェック: 未キャッシュのシンボルだけAPIへ送る ────────────
  const merged: Record<string, string> = {};
  const uncachedSymbols: ExtractedSymbol[] = [];
  let cacheHits = 0;

  for (const symbol of symbols) {
    const key = sqliteCache
      ? sqliteCache.generateKey(symbol.name, symbol.scope)
      : `${symbol.name}::${symbol.scope}`;

    // L1: メモリキャッシュ
    const memHit = memoryCache.get(key);
    if (memHit !== undefined) {
      merged[symbol.name] = memHit;
      cacheHits++;
      continue;
    }

    // L2: SQLiteキャッシュ
    const dbHit = sqliteCache?.get(key);
    if (dbHit !== null && dbHit !== undefined) {
      merged[symbol.name] = dbHit;
      memoryCache.set(key, dbHit); // L2→L1 昇格
      cacheHits++;
      continue;
    }

    uncachedSymbols.push(symbol);
  }

  ch.appendLine(
    `[Rosetta Lens] キャッシュヒット: ${cacheHits}件 / 未キャッシュ: ${uncachedSymbols.length}件`
  );

  if (uncachedSymbols.length === 0) {
    ch.appendLine('[Rosetta Lens] 全シンボルがキャッシュヒット — API呼び出しをスキップ');
    return merged;
  }

  ch.appendLine(`[Rosetta Lens] 翻訳開始: ${uncachedSymbols.length}件 / モデル: ${modelName}`);

  // ── Geminiクライアント初期化 ──────────────────────────────────────────────
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      // 確実なJSONのみを返すよう強制（Markdown装飾を排除）
      responseMimeType: 'application/json',
      // 低温度で安定した翻訳を確保
      temperature: 0.3,
    },
  });

  // ── バッチ処理 ────────────────────────────────────────────────────────────
  const batches = chunkArray(uncachedSymbols, BATCH_SIZE);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    ch.appendLine(
      `[Rosetta Lens] バッチ ${i + 1}/${batches.length}: ${batch.length}件を送信中...`
    );

    try {
      const prompt = buildUserPrompt(batch);
      const result = await model.generateContent(prompt);
      const rawText = result.response.text();

      ch.appendLine(`[Rosetta Lens] バッチ ${i + 1} レスポンス受信 (${rawText.length}文字)`);

      const parsed = parseTranslationResponse(rawText);
      if (parsed) {
        // 入力に存在する識別子のみを受け入れる（LLMの幻覚を防ぐ）
        const validNames = new Set(batch.map(s => s.name));
        // symbolのname→scope逆引きマップ（キャッシュ保存用）
        const scopeMap = new Map(batch.map(s => [s.name, s]));

        for (const [eng, jpn] of Object.entries(parsed)) {
          if (!validNames.has(eng) || typeof jpn !== 'string' || jpn.trim().length === 0) {
            continue;
          }
          const translation = jpn.trim();
          merged[eng] = translation;

          // L1 + L2 両方に保存
          const sym = scopeMap.get(eng);
          if (sym) {
            const key = sqliteCache
              ? sqliteCache.generateKey(sym.name, sym.scope)
              : `${sym.name}::${sym.scope}`;
            memoryCache.set(key, translation);
            sqliteCache?.set(key, translation);
          }
        }

        ch.appendLine(`[Rosetta Lens] バッチ ${i + 1}: ${Object.keys(parsed).length}件パース成功`);
      } else {
        ch.appendLine(
          `[Rosetta Lens] バッチ ${i + 1}: JSONパース失敗 — このバッチをスキップ\n${rawText.slice(0, 200)}`
        );
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);

      // レートリミット（429）の検出
      if (errMsg.includes('429') || errMsg.toLowerCase().includes('rate limit')) {
        vscode.window.showWarningMessage(
          `Rosetta Lens: APIレートリミットに達しました。しばらくしてから再試行してください。`
        );
        ch.appendLine(`[Rosetta Lens] レートリミット検出 — 処理を中断`);
        break;
      }

      ch.appendLine(`[Rosetta Lens] バッチ ${i + 1} エラー: ${errMsg}`);
      // クラッシュせず次のバッチへ継続
    }
  }

  const totalTranslated = Object.keys(merged).length;
  ch.appendLine(`[Rosetta Lens] 翻訳完了: 合計${totalTranslated}件（うちキャッシュ${cacheHits}件）`);
  ch.appendLine(JSON.stringify(merged, null, 2));

  return merged;
}

// ─────────────────────────────────────────────────────────────────────────────
// ユーティリティ
// ─────────────────────────────────────────────────────────────────────────────

/** 配列を指定サイズのチャンクに分割 */
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
