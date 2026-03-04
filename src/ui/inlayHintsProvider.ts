import * as vscode from 'vscode';

// ─────────────────────────────────────────────────────────────────────────────
// Inlay Hints Provider — 対訳モード（フェーズ6）
//
// Decoration API の透明化方式（没入モード）から切り替えた新しいメイン表示モード。
// 英語識別子の直前に日本語テキストをインラインヒントとして表示することで
// 文字の重なりを根本解決する。
// ─────────────────────────────────────────────────────────────────────────────

/** 正規表現の特殊文字をエスケープする */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class RosettaInlayHintsProvider implements vscode.InlayHintsProvider {
  // VS Code に再描画を要求するイベント
  private readonly _onDidChangeInlayHints = new vscode.EventEmitter<void>();
  readonly onDidChangeInlayHints: vscode.Event<void> = this._onDidChangeInlayHints.event;

  /** 現在の翻訳マッピング（英語識別子 → 日本語訳） */
  private currentMappings: Record<string, string> = {};

  /** 翻訳マッピングを更新し、VS Code に再描画を要求する */
  updateMappings(mappings: Record<string, string>): void {
    this.currentMappings = { ...mappings };
    this._onDidChangeInlayHints.fire();
  }

  /** 現在のマッピングをクリアする（トグルOFF時に呼ぶ） */
  clearMappings(): void {
    this.currentMappings = {};
    this._onDidChangeInlayHints.fire();
  }

  /**
   * VS Code から呼ばれる Inlay Hints 生成メソッド。
   * 指定された range 内に含まれる識別子にのみヒントを生成する
   * （ビューポート外の計算コストを削減）。
   */
  provideInlayHints(
    document: vscode.TextDocument,
    range: vscode.Range
  ): vscode.InlayHint[] {
    if (Object.keys(this.currentMappings).length === 0) return [];

    const hints: vscode.InlayHint[] = [];
    const text = document.getText();

    for (const [english, japanese] of Object.entries(this.currentMappings)) {
      const pattern = new RegExp(`\\b${escapeRegex(english)}\\b`, 'g');

      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const pos = document.positionAt(match.index);

        // ビューポート内のみ処理（パフォーマンス最適化）
        if (!range.contains(pos)) continue;

        // 識別子の直前に日本語ラベルを配置
        // ラベル末尾にスペースを入れて英語との間隔を確保
        const hint = new vscode.InlayHint(
          pos,
          `${japanese} `,
          vscode.InlayHintKind.Type
        );

        // ツールチップで元の英語を確認できるようにする
        hint.tooltip = new vscode.MarkdownString(
          `**${english}** の翻訳: \`${japanese}\`\n\n*🔍 Rosetta Lens*`
        );

        hints.push(hint);
      }
    }

    return hints;
  }

  /** EventEmitter を解放する（deactivate 時に呼ぶ） */
  dispose(): void {
    this._onDidChangeInlayHints.dispose();
  }
}
