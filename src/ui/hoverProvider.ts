import * as vscode from 'vscode';

// ─────────────────────────────────────────────────────────────────────────────
// X-Ray Hover Provider — フェーズ6
//
// 識別子にホバーしたとき、元の英語名・日本語訳・Rosettaバッジを表示する。
// Inlay Hints で日本語が表示されている識別子にも対応し、
// 英語⇔日本語の対応関係を視覚的に確認できる「X-Ray」機能を提供する。
// ─────────────────────────────────────────────────────────────────────────────

export class RosettaHoverProvider implements vscode.HoverProvider {
  /** 現在の翻訳マッピング（英語識別子 → 日本語訳） */
  private currentMappings: Record<string, string> = {};

  /** 翻訳マッピングを更新する */
  updateMappings(mappings: Record<string, string>): void {
    this.currentMappings = { ...mappings };
  }

  /** マッピングをクリアする（トグルOFF時） */
  clearMappings(): void {
    this.currentMappings = {};
  }

  /**
   * VS Code から呼ばれるホバー生成メソッド。
   * カーソル位置の識別子が翻訳マッピングに存在する場合、
   * Markdown 形式のホバー情報を返す。
   */
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.Hover | undefined {
    if (Object.keys(this.currentMappings).length === 0) return undefined;

    // カーソル位置の単語範囲を取得
    const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z_]\w*/);
    if (!wordRange) return undefined;

    const word = document.getText(wordRange);
    const translation = this.currentMappings[word];
    if (!translation) return undefined;

    // MarkdownString で X-Ray 情報を表示
    const markdown = new vscode.MarkdownString('', true);
    markdown.isTrusted = true;
    markdown.appendMarkdown(`**\`${word}\`** → **${translation}**\n\n`);
    markdown.appendMarkdown('---\n');
    markdown.appendMarkdown('*🔍 Rosetta Lens による翻訳*');

    return new vscode.Hover(markdown, wordRange);
  }
}
