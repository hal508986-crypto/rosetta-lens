import * as vscode from 'vscode';

// ─────────────────────────────────────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────────────────────────────────────

export interface ExtractedSymbol {
  /** 識別子名（例: "fetchUser"） */
  name: string;
  /** シンボル種別 */
  kind: 'function' | 'variable' | 'class' | 'parameter' | 'other';
  /** エディタ上の位置 */
  range: vscode.Range;
  /** スコープパス（例: "UserService.getUser"） */
  scope: string;
  /** 前後3行のコードスニペット（LLMへのコンテキスト用） */
  snippet: string;
  /** 言語ID */
  languageId: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// フィルターリスト
// ─────────────────────────────────────────────────────────────────────────────

/** TypeScript / JavaScript 予約語（翻訳対象外） */
const TS_JS_RESERVED = new Set([
  // ES予約語
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger',
  'default', 'delete', 'do', 'else', 'export', 'extends', 'finally',
  'for', 'function', 'if', 'import', 'in', 'instanceof', 'let', 'new',
  'of', 'return', 'static', 'super', 'switch', 'this', 'throw', 'try',
  'typeof', 'var', 'void', 'while', 'with', 'yield',
  // TypeScript追加
  'abstract', 'as', 'async', 'await', 'declare', 'enum', 'from',
  'implements', 'interface', 'module', 'namespace', 'readonly', 'type',
  'override', 'satisfies', 'using',
  // 特殊値
  'true', 'false', 'null', 'undefined', 'NaN', 'Infinity',
]);

/** Python 予約語（翻訳対象外） */
const PYTHON_RESERVED = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await',
  'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except',
  'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is',
  'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try',
  'while', 'with', 'yield',
  // ビルトイン
  'self', 'cls', '__init__', '__new__', '__repr__', '__str__',
]);

/** TypeScript / JavaScript 標準ライブラリ（翻訳対象外） */
const TS_JS_STDLIB = new Set([
  // グローバルオブジェクト
  'console', 'Math', 'JSON', 'Array', 'Object', 'String', 'Number',
  'Boolean', 'Symbol', 'BigInt', 'Error', 'Promise', 'Set', 'Map',
  'WeakMap', 'WeakSet', 'WeakRef', 'Date', 'RegExp', 'Function',
  'Proxy', 'Reflect', 'Iterator',
  // グローバル関数
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent',
  'decodeURIComponent', 'encodeURI', 'decodeURI', 'eval', 'setTimeout',
  'setInterval', 'clearTimeout', 'clearInterval', 'queueMicrotask',
  // Node.js
  'process', 'Buffer', 'require', 'module', 'exports', '__dirname',
  '__filename', 'global', 'globalThis',
  // ブラウザ
  'window', 'document', 'navigator', 'location', 'history', 'fetch',
  'XMLHttpRequest', 'WebSocket', 'Worker',
  // TypeScript組み込み型名（大文字）
  'Partial', 'Required', 'Readonly', 'Record', 'Pick', 'Omit',
  'Exclude', 'Extract', 'NonNullable', 'ReturnType', 'InstanceType',
  'Parameters', 'ConstructorParameters', 'Awaited',
]);

/** Python 標準ライブラリ（翻訳対象外） */
const PYTHON_STDLIB = new Set([
  'print', 'len', 'range', 'enumerate', 'zip', 'map', 'filter',
  'sorted', 'list', 'dict', 'set', 'tuple', 'frozenset', 'int', 'str',
  'float', 'bool', 'bytes', 'bytearray', 'complex', 'type',
  'isinstance', 'issubclass', 'super', 'property', 'classmethod',
  'staticmethod', 'open', 'input', 'abs', 'round', 'min', 'max', 'sum',
  'all', 'any', 'iter', 'next', 'hash', 'id', 'repr', 'vars', 'dir',
  'getattr', 'setattr', 'hasattr', 'delattr', 'callable', 'chr', 'ord',
  'hex', 'oct', 'bin', 'format', 'object',
]);

// ─────────────────────────────────────────────────────────────────────────────
// ユーティリティ
// ─────────────────────────────────────────────────────────────────────────────

/** DocumentSymbol かどうかを判定するタイプガード */
function isDocumentSymbol(
  symbol: vscode.DocumentSymbol | vscode.SymbolInformation
): symbol is vscode.DocumentSymbol {
  return 'children' in symbol && 'selectionRange' in symbol;
}

/** SymbolKind を文字列に変換 */
function mapSymbolKind(
  kind: vscode.SymbolKind
): ExtractedSymbol['kind'] {
  switch (kind) {
    case vscode.SymbolKind.Function:
    case vscode.SymbolKind.Method:
    case vscode.SymbolKind.Constructor:
    case vscode.SymbolKind.Event:
    case vscode.SymbolKind.Operator:
      return 'function';
    case vscode.SymbolKind.Variable:
    case vscode.SymbolKind.Constant:
    case vscode.SymbolKind.Property:
    case vscode.SymbolKind.Field:
    case vscode.SymbolKind.EnumMember:
      return 'variable';
    case vscode.SymbolKind.Class:
    case vscode.SymbolKind.Interface:
    case vscode.SymbolKind.Enum:
    case vscode.SymbolKind.Module:
    case vscode.SymbolKind.Namespace:
    case vscode.SymbolKind.Struct:
      return 'class';
    case vscode.SymbolKind.TypeParameter:
      return 'parameter';
    default:
      return 'other';
  }
}

/**
 * 識別子をフィルターすべきか判定
 * 予約語・標準ライブラリ・短すぎる名前を除外
 */
function shouldFilter(name: string, languageId: string): boolean {
  // 1文字以下はスキップ（ループ変数など）
  if (name.length <= 1) return true;
  // 大文字のみ（定数マクロ等）は翻訳価値が低いためスキップ
  if (/^[A-Z_]+$/.test(name)) return true;

  if (languageId === 'python') {
    return PYTHON_RESERVED.has(name) || PYTHON_STDLIB.has(name);
  }
  // typescript / javascript
  return TS_JS_RESERVED.has(name) || TS_JS_STDLIB.has(name);
}

/**
 * 指定行の前後3行をスニペットとして抽出
 * LLMに渡すコンテキスト情報として使用
 */
function extractSnippet(document: vscode.TextDocument, range: vscode.Range): string {
  const startLine = Math.max(0, range.start.line - 3);
  const endLine = Math.min(document.lineCount - 1, range.end.line + 3);
  const lines: string[] = [];
  for (let i = startLine; i <= endLine; i++) {
    lines.push(document.lineAt(i).text);
  }
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// LSP ベースの抽出（DocumentSymbol 再帰走査）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * DocumentSymbol を再帰走査して ExtractedSymbol[] に変換する
 * @param symbols LSPから得たシンボル配列
 * @param document 対象ドキュメント
 * @param languageId 言語ID
 * @param scopePrefix 親スコープパス（再帰用）
 * @param results 結果の蓄積先
 */
function traverseDocumentSymbols(
  symbols: vscode.DocumentSymbol[],
  document: vscode.TextDocument,
  languageId: string,
  scopePrefix: string,
  results: ExtractedSymbol[]
): void {
  for (const symbol of symbols) {
    const scopePath = scopePrefix ? `${scopePrefix}.${symbol.name}` : symbol.name;

    if (!shouldFilter(symbol.name, languageId)) {
      results.push({
        name: symbol.name,
        kind: mapSymbolKind(symbol.kind),
        range: symbol.selectionRange,
        scope: scopePath,
        snippet: extractSnippet(document, symbol.range),
        languageId,
      });
    }

    // 子シンボル（クラスメンバー・ネスト関数等）を再帰処理
    if (symbol.children.length > 0) {
      traverseDocumentSymbols(symbol.children, document, languageId, scopePath, results);
    }
  }
}

/**
 * LSP の executeDocumentSymbolProvider を呼び出す（リトライ付き）
 * Language Server 未起動の場合は 3秒 × 最大3回リトライ
 */
async function fetchDocumentSymbols(
  document: vscode.TextDocument,
  retries = 3,
  delayMs = 3000
): Promise<(vscode.DocumentSymbol | vscode.SymbolInformation)[] | undefined> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const symbols = await vscode.commands.executeCommand<
        (vscode.DocumentSymbol | vscode.SymbolInformation)[]
      >('vscode.executeDocumentSymbolProvider', document.uri);

      if (symbols && symbols.length > 0) {
        return symbols;
      }

      getOutputChannel().appendLine(
        `[Rosetta Lens] LSP シンボル取得: 試行 ${attempt}/${retries} — 結果なし`
      );
    } catch (err) {
      getOutputChannel().appendLine(
        `[Rosetta Lens] LSP シンボル取得エラー (試行 ${attempt}/${retries}): ${String(err)}`
      );
    }

    if (attempt < retries) {
      await new Promise<void>(resolve => setTimeout(resolve, delayMs));
    }
  }
  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Python 正規表現フォールバック
// （LSP が使えない環境・Python Language Server 未インストール時）
// ─────────────────────────────────────────────────────────────────────────────

const PYTHON_PATTERNS: Array<{
  regex: RegExp;
  kind: ExtractedSymbol['kind'];
}> = [
  { regex: /^(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/gm, kind: 'function' },
  { regex: /^class\s+([A-Za-z_]\w*)\s*[:(]/gm, kind: 'class' },
  { regex: /^([A-Za-z_]\w*)\s*(?::[ \t]*\S.*)?=(?!=)/gm, kind: 'variable' },
];

function extractPythonFallback(document: vscode.TextDocument): ExtractedSymbol[] {
  const text = document.getText();
  const results: ExtractedSymbol[] = [];

  for (const { regex, kind } of PYTHON_PATTERNS) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const name = match[1];
      if (!name || shouldFilter(name, 'python')) continue;

      const startPos = document.positionAt(match.index + match[0].indexOf(name));
      const endPos = new vscode.Position(startPos.line, startPos.character + name.length);
      const range = new vscode.Range(startPos, endPos);

      results.push({
        name,
        kind,
        range,
        scope: name,
        snippet: extractSnippet(document, range),
        languageId: 'python',
      });
    }
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Output Channel
// ─────────────────────────────────────────────────────────────────────────────

let _outputChannel: vscode.OutputChannel | undefined;

export function getOutputChannel(): vscode.OutputChannel {
  if (!_outputChannel) {
    _outputChannel = vscode.window.createOutputChannel('Rosetta Lens');
  }
  return _outputChannel;
}

export function disposeOutputChannel(): void {
  _outputChannel?.dispose();
  _outputChannel = undefined;
}

/** 抽出結果を Output Channel に JSON 形式で出力 */
function logSymbols(symbols: ExtractedSymbol[], documentUri: string): void {
  const ch = getOutputChannel();
  ch.appendLine('');
  ch.appendLine(`${'─'.repeat(60)}`);
  ch.appendLine(`[Rosetta Lens] シンボル抽出結果: ${documentUri}`);
  ch.appendLine(`抽出件数: ${symbols.length}`);
  ch.appendLine(`${'─'.repeat(60)}`);

  // 表示用にrangeを文字列化（JSONシリアライズ不可のため変換）
  const serializable = symbols.map(s => ({
    name: s.name,
    kind: s.kind,
    scope: s.scope,
    languageId: s.languageId,
    range: {
      start: { line: s.range.start.line + 1, character: s.range.start.character },
      end: { line: s.range.end.line + 1, character: s.range.end.character },
    },
    snippet: s.snippet.trim().split('\n').slice(0, 2).join(' | '), // ログは2行だけ
  }));

  ch.appendLine(JSON.stringify(serializable, null, 2));
  ch.appendLine('');
}

// ─────────────────────────────────────────────────────────────────────────────
// 公開API
// ─────────────────────────────────────────────────────────────────────────────

/** 対応言語ID */
export const SUPPORTED_LANGUAGES = new Set(['typescript', 'javascript', 'typescriptreact', 'javascriptreact', 'python']);

/**
 * ドキュメントからユーザー定義識別子を抽出するメインエントリーポイント。
 *
 * 処理フロー:
 *   1. LSP (executeDocumentSymbolProvider) でシンボルを取得（リトライ×3）
 *   2. Python で LSP 結果がなければ正規表現フォールバック
 *   3. 結果を Output Channel に JSON 出力
 */
export async function extractSymbols(
  document: vscode.TextDocument
): Promise<ExtractedSymbol[]> {
  const { languageId } = document;

  if (!SUPPORTED_LANGUAGES.has(languageId)) {
    getOutputChannel().appendLine(
      `[Rosetta Lens] 未対応の言語: ${languageId} — スキップ`
    );
    return [];
  }

  getOutputChannel().appendLine(
    `[Rosetta Lens] シンボル抽出開始: ${document.uri.fsPath} (${languageId})`
  );

  // ── LSP ベースの抽出 ────────────────────────────────────────────────────
  const rawSymbols = await fetchDocumentSymbols(document);
  let results: ExtractedSymbol[] = [];

  if (rawSymbols && rawSymbols.length > 0) {
    if (isDocumentSymbol(rawSymbols[0])) {
      // DocumentSymbol 形式（階層あり）→ 再帰走査
      traverseDocumentSymbols(
        rawSymbols as vscode.DocumentSymbol[],
        document,
        languageId,
        '',
        results
      );
    } else {
      // SymbolInformation 形式（フラット）→ そのまま変換
      for (const sym of rawSymbols as vscode.SymbolInformation[]) {
        if (shouldFilter(sym.name, languageId)) continue;
        results.push({
          name: sym.name,
          kind: mapSymbolKind(sym.kind),
          range: sym.location.range,
          scope: sym.containerName ? `${sym.containerName}.${sym.name}` : sym.name,
          snippet: extractSnippet(document, sym.location.range),
          languageId,
        });
      }
    }
  }

  // ── Python 正規表現フォールバック ───────────────────────────────────────
  if (results.length === 0 && languageId === 'python') {
    getOutputChannel().appendLine(
      '[Rosetta Lens] Python LSP 未応答 — 正規表現フォールバックを使用'
    );
    results = extractPythonFallback(document);
  }

  // ── 結果をログ出力 ────────────────────────────────────────────────────────
  logSymbols(results, document.uri.fsPath);

  return results;
}
