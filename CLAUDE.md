# 基本制約
- 進捗やタスク、プランの作成は全て日本語で応答を。
- 各フェーズ完了時にsummary_PX.mdを作成すること

# Rosetta Lens — タスク分解 & Agent投げ先ガイド

> VS Code拡張機能「Rosetta Lens」
> コードを破壊せず、表示層のみでLLMによる文脈依存の日本語翻訳を重畳するVS Code拡張。

---

## フェーズ一覧サマリー

| # | フェーズ名 | アウトプット | 投げ先 | 依存 |
|---|---|---|---|---|
| 1 | プロジェクト足場組み | 動くExtensionの骨格 | Claude Code | なし |
| 2 | Decoration APIによるオーバーレイ描画 | ハードコードJSON→日本語表示 | Claude Code | Ph1 |
| 3 | AST/LSP解析エンジン | 識別子+スコープの抽出モジュール | Claude Code | Ph1 |
| 4 | LLM翻訳パイプライン | Gemini API連携+JSONマッピング生成 | Claude Code | Ph3 |
| 5 | キャッシュ & デバウンス最適化 | SQLiteキャッシュ+タイピング制御 | Gemini 2.5 Pro | Ph4 |
| 6 | UX機能実装 | トグル・X-Rayホバー・コピーサニタイズ | Claude Code | Ph2,Ph4 |

---

## フェーズ 1: プロジェクト足場組み

**目標**: VS Code Extension (TypeScript) の動作するスケルトンを作成する

**入力**: なし（ゼロから）

**タスク**:
- [ ] `yo code` でExtensionプロジェクトを生成（TypeScript選択）
- [ ] `package.json` にコマンド・アクティベーションイベントを定義
- [ ] `extension.ts` にHello World相当のコマンドを実装しF5デバッグ起動確認
- [ ] ディレクトリ構成を設計（`src/decorator`, `src/ast`, `src/llm`, `src/cache`）
- [ ] ESLint + Prettierの設定

**完了条件**: `F5`でExtension Development Hostが起動し、コマンドパレットから独自コマンドが実行できること

**リスク・注意点**:
- Node.js バージョンはVS Code Extension開発推奨版（18以上）を使うこと
- `vsce`のバージョンに注意（古いと`package`コマンドが失敗する）

**推奨投げ先**: Claude Code
**理由**: ディレクトリ設計・複数ファイル生成・設定ファイル群の整合性チェックが必要

---

### 📋 Claude Code 投げプロンプト（フェーズ1）

```
# Rosetta Lens — フェーズ1: VS Code Extension 足場組み

## コンテキスト
「Rosetta Lens」というVS Code拡張機能を新規開発する。
コードのソースファイルを一切変更せず、エディタの表示層（Decoration API）のみで
英語の識別子（変数名・関数名）を日本語にオーバーレイ表示するツール。

## あなたのタスク
TypeScriptでVS Code拡張のスケルトンを作成してください。

1. プロジェクト構成を以下のディレクトリで設計する:
   - src/decorator/  — Decoration API関連
   - src/ast/        — AST/LSP解析関連
   - src/llm/        — LLM API連携関連
   - src/cache/      — キャッシュ関連
   - src/extension.ts — エントリーポイント

2. package.jsonに以下を定義する:
   - コマンド: `rosetta-lens.toggle`（翻訳レイヤーのON/OFF）
   - アクティベーション: onStartupFinished

3. extension.tsにトグルコマンドのスタブを実装する（まだロジックは不要、コンソールログのみ）

## 制約・注意事項
- TypeScript strict mode有効
- VS Code Engine: ^1.85.0
- Node.js: 18以上
- ESLint + Prettier設定も含めること

## 完了条件
F5キーでExtension Development Hostが起動し、コマンドパレットから`Rosetta Lens: Toggle`が表示・実行できること
```

---

## フェーズ 2: Decoration APIによるオーバーレイ描画

**目標**: ハードコードしたJSON辞書をもとに、英語識別子を日本語でオーバーレイ表示するレンダリングモジュールを実装

**入力**: フェーズ1の骨格

**タスク**:
- [ ] `window.createTextEditorDecorationType` で「文字色transparent + ::before疑似要素」の装飾を実装
- [ ] テスト用ハードコードJSONマッピング作成（例: `{"fetchUser": "ユーザー取得", "isActive": "有効状態か"}`）
- [ ] アクティブなエディタのテキストを正規表現でスキャンし識別子の位置（Range）を特定
- [ ] 装飾の適用・解除をトグルコマンドに接続
- [ ] 日英切り替えがステータスバーに反映されるUI実装

**完了条件**: サンプルのTypeScriptファイルを開くと、ハードコードされた識別子が日本語に見え、トグルで元に戻ること

**リスク・注意点**:
- `color: transparent` + `contentText`の組み合わせはCSS疑似要素経由のため、フォントサイズのズレに注意
- マルチカーソル・折り返し表示時のRangeのズレを早めに検証すること

**推奨投げ先**: Claude Code
**理由**: VS Code APIの複数クラスを横断する実装でファイル間の整合性管理が必要

---

### 📋 Claude Code 投げプロンプト（フェーズ2）

```
# Rosetta Lens — フェーズ2: Decoration APIオーバーレイ描画

## コンテキスト
フェーズ1で作成したVS Code Extension骨格に、
「英語の識別子を透明化し、日本語テキストを重畳表示する」レンダリングモジュールを追加する。

## あなたのタスク
src/decorator/overlayDecorator.ts を実装してください。

1. `window.createTextEditorDecorationType` を使い以下の装飾を定義する:
   - 元テキストの色: transparent（不可視化）
   - before.contentText: 翻訳テキスト（日本語）
   - before.color: #AACCFF（識別できる色）

2. テスト用のハードコードマッピングJSON（10件程度）を定義:
   例: { "fetchUser": "ユーザー取得", "isActive": "有効状態か", "handleError": "エラー処理" }

3. アクティブなエディタのテキストをスキャンし、マッピングに一致する識別子のRangeを特定して装飾を適用する関数を実装

4. extension.tsのトグルコマンドからこのモジュールを呼び出し、ON/OFFを切り替える

5. ステータスバーに「🔍 Rosetta: ON」「Rosetta: OFF」を表示する

## 制約・注意事項
- 識別子の検出は単語境界（\b）を使った正規表現で行う
- 装飾の重複適用を防ぐため、適用前に必ずdispose()すること
- フェーズ2ではLLM連携不要、ハードコードJSONのみ

## 完了条件
サンプルのTypeScriptファイルを開き、ハードコード識別子が日本語表示され、トグルで英語に戻ること
```

---

## フェーズ 3: AST/LSP解析エンジン

**目標**: ファイル内の全識別子（関数名・変数名・クラス名）をスコープ情報付きで抽出するエンジンを実装

**入力**: フェーズ1の骨格

**タスク**:
- [ ] LSPの`textDocument/documentSymbol`リクエストで識別子リストを取得
- [ ] TypeScript/JavaScript, Pythonを初期対応言語とする
- [ ] 抽出結果をJSONスキーマで定義（識別子名・種別・スコープ・行番号・周辺コードスニペット）
- [ ] 予約語・標準ライブラリ関数のフィルタリングリストを作成
- [ ] Error Tolerant Parser対応（構文エラーがあっても部分的に動作）

**完了条件**: TypeScriptファイルを開くと、全ユーザー定義識別子がJSON形式でログ出力されること

**リスク・注意点**:
- `vscode.executeDocumentSymbolProvider`はLanguage Serverの起動を待つ必要がある（タイムアウト処理を入れること）
- ローカル変数はdocumentSymbolに含まれないケースがある → その場合はASTパーサー（`@typescript-eslint/parser`等）を併用

**推奨投げ先**: Claude Code
**理由**: LSP APIの非同期処理・エラーハンドリング・複数ファイルパーサーの統合が必要

---

### 📋 Claude Code 投げプロンプト（フェーズ3）

```
# Rosetta Lens — フェーズ3: AST/LSP解析エンジン

## コンテキスト
VS Code Extension「Rosetta Lens」のコア。
ファイル内のユーザー定義識別子（変数名・関数名・クラス名）をスコープ情報付きで抽出するエンジンを作る。
この抽出結果がフェーズ4のLLM翻訳の入力になる。

## あなたのタスク
src/ast/symbolExtractor.ts を実装してください。

1. `vscode.executeDocumentSymbolProvider` でドキュメントシンボルを取得する関数

2. 抽出結果の型定義（TypeScript interface）:
```typescript
interface ExtractedSymbol {
  name: string;          // 識別子名（例: "fetchUser"）
  kind: string;          // "function" | "variable" | "class" | "parameter"
  range: vscode.Range;   // エディタ上の位置
  scope: string;         // スコープパス（例: "UserService.getUser"）
  snippet: string;       // 前後3行のコードスニペット（LLMへのコンテキスト用）
  languageId: string;    // "typescript" | "javascript" | "python"
}
```

3. 予約語フィルター（if, for, return, async, await, import, export... 最低30語）

4. 標準ライブラリ関数フィルター（console, Math, JSON, Array, Object...）

5. Python対応: LSPが使えない場合は `python-ast` パターンで正規表現フォールバック

## 制約・注意事項
- Language Serverが未起動の場合は3秒リトライ×3回
- TypeScript/JavaScript/Python の3言語を最低限サポート
- 抽出結果はVSCode OutputChannelにJSON形式でデバッグログ出力すること

## 完了条件
TypeScriptファイルを開くと、ユーザー定義識別子の一覧がJSON形式でOutput Channelに出力されること
```

---

## フェーズ 4: LLM翻訳パイプライン（Gemini API連携）

**目標**: フェーズ3の抽出結果をGemini APIに送り、文脈依存の日本語翻訳JSONマッピングを生成するパイプラインを実装

**入力**: フェーズ3のExtractedSymbol[]

**タスク**:
- [ ] Gemini API（`gemini-2.5-pro`）クライアントの実装
- [ ] プロンプトエンジニアリング（予約語除外・型情報活用・JSON強制出力）
- [ ] APIレスポンスのJSONパース + バリデーション
- [ ] フェーズ2のDecorationモジュールへの翻訳マッピング受け渡し
- [ ] APIキーをVS Code設定（`settings.json`）から取得する仕組み

**完了条件**: 実際のTypeScriptファイルを開くと、LLMが生成した日本語翻訳がオーバーレイ表示されること

**リスク・注意点**:
- LLMが予約語まで翻訳しようとする場合のフィルタリングを必ず実装
- JSON出力が崩れた場合のfallback処理（re-try or 英語のまま表示）
- Gemini APIのレート制限：2.5 Proは無料枠のRPM制限に注意

**推奨投げ先**: Claude Code
**理由**: 非同期パイプライン・エラーハンドリング・複数モジュールの接続が必要

---

### 📋 Claude Code 投げプロンプト（フェーズ4）

```
# Rosetta Lens — フェーズ4: Gemini API翻訳パイプライン

## コンテキスト
フェーズ3で抽出した識別子リスト（ExtractedSymbol[]）を
Gemini APIに送信し、文脈依存の日本語翻訳JSONを取得するパイプラインを実装する。

APIキーはGemini（Google AI Studio）のものを使用する。

## あなたのタスク
src/llm/translationPipeline.ts を実装してください。

1. Gemini APIクライアント（@google/generative-ai パッケージを使用）

2. システムプロンプト設計:
   - 予約語・標準ライブラリ関数は翻訳対象外
   - 配列型→複数形表現、boolean型→「〜か」形式
   - 出力は必ずJSON形式: `{ "英語識別子": "日本語訳" }` のみ
   - コードのコンテキスト（snippet）を考慮した意味論的翻訳

3. バッチ送信: 識別子を最大50件ずつまとめてAPI送信（コスト最適化）

4. レスポンスのJSONパース + バリデーション（型チェック）

5. VS Code設定から `rosettaLens.geminiApiKey` を取得する仕組み

6. フェーズ2のoverlayDecorator.tsに翻訳マッピングを渡してDecoration更新

## 制約・注意事項
- APIキーはソースコードにハードコードしない
- JSONパース失敗時: 該当識別子は英語のまま表示（クラッシュしない）
- モデル: gemini-2.5-pro

## 完了条件
APIキーを設定した状態で実際のTypeScriptファイルを開くと、LLM生成の日本語がオーバーレイ表示されること
```

---

## フェーズ 5: キャッシュ & デバウンス最適化

**目標**: SQLiteキャッシュとデバウンス処理でAPI呼び出しを最小化し、体感速度を改善

**入力**: フェーズ4の翻訳パイプライン

**タスク**:
- [ ] `better-sqlite3` を使ったTTL付きローカルキャッシュ（キー: 識別子名+スコープハッシュ）
- [ ] TTL: 7日間（設定で変更可能）
- [ ] LRUアルゴリズムでメモリキャッシュ管理（上限: 1000件）
- [ ] タイピング停止1000ms後 or ファイル保存時のみAPI呼び出しトリガー
- [ ] キャッシュヒット率をステータスバーに表示（デバッグ用）

**完了条件**: 同じファイルを2回開いたとき、2回目はAPIを呼ばずキャッシュから即時表示されること

**リスク・注意点**:
- `better-sqlite3` はネイティブモジュールのためVS Code拡張でのビルド設定に注意（`@vscode/sqlite3`の使用も検討）

**推奨投げ先**: Gemini 2.5 Pro
**理由**: 単一モジュール・明確な仕様・テキスト変換処理寄り

---

### 📋 Gemini 2.5 Pro 投げプロンプト（フェーズ5）

```
以下のタスクを実行してください。

## タスク
VS Code Extension「Rosetta Lens」のキャッシュ & デバウンスモジュールを実装する。

## 入力
- フェーズ4で実装した翻訳パイプライン（src/llm/translationPipeline.ts）
- キャッシュキー: `${識別子名}::${スコープパス}` のSHA256ハッシュ

## 実装内容
1. src/cache/translationCache.ts:
   - better-sqlite3（または@vscode/sqlite3）を使用
   - テーブル: `cache(key TEXT PRIMARY KEY, value TEXT, expires_at INTEGER)`
   - TTL: デフォルト7日（`rosettaLens.cacheTTLDays`設定で変更可能）
   - get(key): キャッシュ取得（期限切れはnull）
   - set(key, value): キャッシュ保存
   - clear(): 全キャッシュ削除

2. src/cache/lruMemoryCache.ts:
   - インメモリLRUキャッシュ（上限1000件）
   - SQLiteの前段として機能

3. デバウンス処理:
   - テキスト変更イベント（onDidChangeTextDocument）に1000msデバウンスを適用
   - ファイル保存（onDidSaveTextDocument）は即時トリガー

## 期待する出力
- src/cache/translationCache.ts
- src/cache/lruMemoryCache.ts
- translationPipeline.tsにキャッシュ統合した差分コード

## 注意事項
- better-sqlite3のインポートエラー時はインメモリのみにフォールバック
- TypeScript strict mode対応
```

---

## フェーズ 6: UX機能実装

**目標**: トグル・X-Rayホバー・コピーサニタイズの3大UX機能を実装し、プロダクト品質に仕上げる

**入力**: フェーズ2, フェーズ4の成果物

**タスク**:
- [ ] **Bilingual Toggle**: ステータスバーアイコン + `Ctrl+Shift+L` ショートカット
- [ ] **X-Ray Hover**: 日本語表示中でも元の英語識別子・型情報・解説をツールチップ表示
- [ ] **コピーサニタイズ**: クリップボードコピー時に日本語ではなく元の英語コードが入るよう処理
- [ ] README.md（使い方・スクショ・GIF）の作成
- [ ] VS Code Marketplace公開用 `package.json` の整備（カテゴリ・タグ・アイコン）

**完了条件**: 全機能が動作し、Marketplaceへのパッケージング（`vsce package`）が成功すること

**リスク・注意点**:
- コピーサニタイズは`registerDocumentPasteEditProvider`またはクリップボードAPIのフックで実装するが、VS Codeのバージョン依存あり
- X-Rayホバーは`vscode.languages.registerHoverProvider`で実装

**推奨投げ先**: Claude Code
**理由**: 複数のVS Code APIを横断し、UX全体の整合性が必要

---

### 📋 Claude Code 投げプロンプト（フェーズ6）

```
# Rosetta Lens — フェーズ6: UX機能実装

## コンテキスト
VS Code Extension「Rosetta Lens」のコア機能（Decoration表示・LLM翻訳・キャッシュ）は完成済み。
最終フェーズとして3つのUX機能を実装し、Marketplace公開できる状態に仕上げる。

## あなたのタスク

### 1. Bilingual Toggle（src/ui/toggle.ts）
- ステータスバー左下に「🔍 Rosetta: ON/OFF」ボタンを配置
- `Ctrl+Shift+L`（Mac: `Cmd+Shift+L`）ショートカットでもトグル可能
- ON時: Decoration適用、OFF時: 全Decoration解除して元の英語表示

### 2. X-Ray Hover（src/ui/hoverProvider.ts）
- `vscode.languages.registerHoverProvider` で実装
- 日本語オーバーレイが適用された識別子にホバーすると以下を表示:
  - 元の英語識別子名（太字）
  - 型情報（LSPから取得）
  - 翻訳の根拠（「この関数はユーザー認証情報を取得する役割のため〜と翻訳」）

### 3. コピーサニタイズ
- 選択テキストをコピーした際、クリップボードには元の英語コードが入るよう処理
- `vscode.env.clipboard.writeText` と選択範囲の元テキストを組み合わせて実装

### 4. Marketplace整備
- package.jsonに: categories, keywords, icon（128x128 PNG）, galleryBanner
- README.mdに: 機能説明・スクリーンショット・設定項目一覧・インストール手順

## 制約・注意事項
- VS Code Engine: ^1.85.0以上の機能のみ使用
- コピーサニタイズはDecoration ONの時のみ動作

## 完了条件
`vsce package` が成功し、.vsixファイルが生成されること
全3機能が正常動作すること
```

---

## 開発メモ

**技術スタック確定**:
- 言語: TypeScript
- LLM: Gemini 2.5 Pro（Google AI Studio APIキー）
- VS Code API: Decoration API（没入モード）+ Inlay Hints API（対訳モード、フェーズ6以降）
- キャッシュ: SQLite（better-sqlite3）+ LRUメモリキャッシュ
- 対応言語（初期）: TypeScript / JavaScript / Python

**コスト試算（Gemini 2.5 Pro）**:
- 1ファイル平均50識別子、1トークン≈1単語として概算
- 入力: 識別子+スニペット × 50 ≈ 2,000トークン
- 出力: JSON × 50 ≈ 500トークン
- 5月まで無料クレジットで十分にPoCとベータ開発をカバーできる見込み
