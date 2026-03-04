# 🔍 Rosetta Lens

> **AIが書いたコードを、あなたの言葉で読む。**

Vibe Codingの時代、コードは書けるけど読めない——そんな「解読の壁」を壊すVS Code拡張機能。

英語の識別子（関数名・変数名）を**コードを1バイトも変えず**、エディタの表示層のみで日本語に翻訳します。

---

## ✨ 特徴

### 非破壊的な仮想レイヤー
ソースコードは一切変更しません。Gitの差分もゼロ。チーム開発でも安全に使えます。

### 文脈を理解した翻訳
単純な辞書翻訳ではなく、LSP/ASTで取得したスコープ情報とコードの文脈をLLMに渡して翻訳します。`isActive` → `有効状態か`、`fetchUserById` → `ID指定ユーザー取得` のように、型や役割を考慮した自然な日本語になります。

### ゼロレイテンシのキャッシュ
翻訳結果はL1（LRUメモリ）＋L2（SQLite永続化）の2層キャッシュで保存。2回目以降のファイル展開はAPIを呼ばずに即座に表示されます。

### X-Ray Hover
日本語表示中でも、識別子にホバーすると元の英語名・型情報・翻訳の根拠がツールチップで確認できます。

---

## 🚀 インストール

### VS Code Marketplace（準備中）
VS Code の拡張機能パネルで `Rosetta Lens` を検索してインストール。

### .vsix から手動インストール
```bash
code --install-extension rosetta-lens-0.1.0.vsix
```

---

## ⚙️ セットアップ

### 1. Gemini API キーを取得
[Google AI Studio](https://aistudio.google.com/) で無料のAPIキーを取得してください。

### 2. VS Code の設定に追加
`Ctrl+,`（Mac: `Cmd+,`）で設定を開き、`rosettaLens` で検索。

または `settings.json` に直接記述：

```json
{
  "rosettaLens.geminiApiKey": "AIza...",
  "rosettaLens.geminiModel": "gemini-2.5-flash-preview-04-17"
}
```

| 設定キー | デフォルト | 説明 |
|---|---|---|
| `rosettaLens.geminiApiKey` | `""` | Google AI Studio の API キー |
| `rosettaLens.geminiModel` | `gemini-2.5-flash-preview-04-17` | 使用する Gemini モデル |
| `rosettaLens.cacheTTLDays` | `7` | キャッシュの有効期限（日） |

---

## 📖 使い方

| 操作 | 説明 |
|---|---|
| `Ctrl+Shift+L` / `Cmd+Shift+L` | 翻訳レイヤーのON/OFF |
| 識別子にホバー | 元の英語名・翻訳根拠を表示（X-Ray Hover） |
| `Ctrl+Shift+P` → `Rosetta Lens: Clear Cache` | キャッシュを全削除 |

### 対応言語
- TypeScript / JavaScript
- Python

---

## 🏗️ アーキテクチャ

```
Ctrl+Shift+L（Toggle ON）
    ↓
extractSymbols()      LSP/ASTで識別子・スコープを抽出
    ↓
translateSymbols()    Gemini APIで文脈依存の日本語翻訳を生成
    ↓
updateMappings()      翻訳マッピングをInlay Hints Providerに渡す
    ↓
provideInlayHints()   エディタ上に日本語をオーバーレイ表示
```

---

## ⚠️ 既知の制限（v0.1.0）

- 関数内のローカル変数は検出されない場合があります（LSPの仕様）
- プロポーショナルフォント環境では表示がずれる場合があります
- `editor.inlayHints.enabled` が無効の場合は表示されません

---

## 🗺️ ロードマップ

- [ ] **v0.2.0** — 後置表示モード・没入モード（英語を完全に隠す）の追加
- [ ] **v0.3.0** — 保守性スコア・コードレビュー観点のコメント追加
- [ ] **v0.4.0** — カスタム辞書（ドメイン固有語の登録）
- [ ] **v1.0.0** — 多言語対応（スペイン語・中国語・韓国語）

---

## 💬 フィードバック

バグ報告・機能要望は [GitHub Issues](../../issues) へ。

開発の経緯や技術的な詳細は Zenn の記事でも紹介しています：
👉 **[Zenn記事リンク（準備中）]**

---

## 📄 ライセンス

MIT License — 詳細は [LICENSE](LICENSE) を参照してください。

---

*このプロジェクトは Claude × Gemini の分業体制で1日で開発されました。*
