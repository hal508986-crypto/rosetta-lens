import * as vscode from 'vscode';

// ─────────────────────────────────────────────────────────────────────────────
// 没入モード (Decoration API) — フェーズ6でコメントアウト済み
//
// フェーズ2〜5で実装した「color: transparent + before.contentText」方式の
// 没入型オーバーレイモード。文字の重なり問題があるため、フェーズ6では
// Inlay Hints API による対訳モード（src/ui/inlayHintsProvider.ts）に切り替えた。
//
// 将来的に没入モードを復活させる際は、このコメントブロックを解除し、
// 下部の no-op スタブを削除することで元に戻せる。
// ─────────────────────────────────────────────────────────────────────────────

// NOTE: ブロックコメント内に */ が含まれるため行コメント形式で保持する
//
// === 没入モードコード開始 ===
//
// export const DEFAULT_MAPPINGS: Record<string, string> = {
//   save: '保存',
//   load: '読込',
//   isActive: '有効状態か',
//   saveData: 'データ保存',
//   loadConfig: '設定読込',
//   fetchUser: 'ユーザー取得',
//   handleError: 'エラー処理',
//   createSession: 'セッション作成',
//   validateToken: 'トークン検証',
//   sendNotification: '通知送信',
//   getUserById: 'ID指定ユーザー取得',
//   updateProfile: 'プロフィール更新',
//   deleteAccount: 'アカウント削除',
//   processPayment: '支払い処理',
//   generateAccessToken: 'アクセストークン生成',
// };
//
// // 翻訳ペア（english::japanese）をキーとするDecorationTypeのキャッシュ
// const decorationTypeCache = new Map<string, vscode.TextEditorDecorationType>();
// // 現在アクティブなDecorationType一覧（clearDecorations用）
// let activeDecorationTypes: vscode.TextEditorDecorationType[] = [];
// // 現在使用中の翻訳マッピング
// let currentMappings: Record<string, string> = { ...DEFAULT_MAPPINGS };
//
// // 幅補正ロジック（Geminiの知見: after.marginで等幅フォントのズレを補正）
// // 前提: ASCII文字 1文字≈1ch / CJK文字 1文字≈2ch
// function calcAfterMargin(english: string, japanese: string): string {
//   const cjkCount = countCjkChars(japanese);
//   const nonCjkCount = japanese.length - cjkCount;
//   const japaneseWidth = cjkCount * 2 + nonCjkCount;
//   const englishWidth = english.length;
//   const excessWidth = japaneseWidth - englishWidth;
//   if (excessWidth > 0) {
//     return `0 0 0 -${englishWidth + excessWidth}ch`;
//   } else {
//     return `0 0 0 -${englishWidth}ch`;
//   }
// }
//
// function countCjkChars(str: string): number {
//   return (str.match(/[\u3000-\u9fff\uff00-\uffef]/g) ?? []).length;
// }
//
// function getOrCreateDecorationType(english: string, japanese: string): vscode.TextEditorDecorationType {
//   const cacheKey = `${english}::${japanese}`;
//   if (!decorationTypeCache.has(cacheKey)) {
//     const afterMargin = calcAfterMargin(english, japanese);
//     const decorationType = vscode.window.createTextEditorDecorationType({
//       color: 'rgba(0, 0, 0, 0)',
//       before: {
//         contentText: japanese,
//         color: '#AACCFF',
//         fontStyle: 'normal',
//         fontWeight: 'normal',
//         margin: '0 1px 0 0',
//       },
//       after: {
//         contentText: '',
//         margin: afterMargin,
//       },
//     });
//     decorationTypeCache.set(cacheKey, decorationType);
//   }
//   return decorationTypeCache.get(cacheKey)!;
// }
//
// export function applyDecorations(editor: vscode.TextEditor): void {
//   clearDecorations();
//   const text = editor.document.getText();
//   for (const [english, japanese] of Object.entries(currentMappings)) {
//     const pattern = new RegExp(`\\b${escapeRegex(english)}\\b`, 'g');
//     const decorationType = getOrCreateDecorationType(english, japanese);
//     const ranges: vscode.Range[] = [];
//     let match: RegExpExecArray | null;
//     while ((match = pattern.exec(text)) !== null) {
//       const startPos = editor.document.positionAt(match.index);
//       const endPos = editor.document.positionAt(match.index + english.length);
//       ranges.push(new vscode.Range(startPos, endPos));
//     }
//     if (ranges.length > 0) {
//       editor.setDecorations(decorationType, ranges);
//       activeDecorationTypes.push(decorationType);
//     }
//   }
// }
//
// export function clearDecorations(): void {
//   for (const decorationType of activeDecorationTypes) {
//     vscode.window.visibleTextEditors.forEach(editor => {
//       editor.setDecorations(decorationType, []);
//     });
//   }
//   activeDecorationTypes = [];
// }
//
// export function updateMappings(newMappings: Record<string, string>): void {
//   disposeAllDecorationTypes();
//   currentMappings = { ...newMappings };
// }
//
// export function getCurrentMappings(): Readonly<Record<string, string>> {
//   return currentMappings;
// }
//
// export function disposeAllDecorationTypes(): void {
//   clearDecorations();
//   for (const decorationType of decorationTypeCache.values()) {
//     decorationType.dispose();
//   }
//   decorationTypeCache.clear();
// }
//
// function escapeRegex(str: string): string {
//   return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// }
//
// === 没入モードコード終了 ===

// ─────────────────────────────────────────────────────────────────────────────
// No-op スタブ（フェーズ6移行後）
//
// extension.ts の import を壊さないよう、同じシグネチャの空実装を残す。
// 没入モードを復活させる際はこのスタブを削除し、上の行コメントを解除する。
// ─────────────────────────────────────────────────────────────────────────────

/** @deprecated 没入モード用 — フェーズ6では InlayHints API に移行済み */
export function applyDecorations(_editor: vscode.TextEditor): void {
  // 没入モード用: フェーズ6でコメントアウト済み
}

/** @deprecated 没入モード用 — フェーズ6では InlayHints API に移行済み */
export function clearDecorations(): void {
  // 没入モード用: フェーズ6でコメントアウト済み
}

/** @deprecated 没入モード用 — フェーズ6では InlayHints API に移行済み */
export function disposeAllDecorationTypes(): void {
  // 没入モード用: フェーズ6でコメントアウト済み
}

/** @deprecated 没入モード用 — フェーズ6では InlayHints API に移行済み */
export function updateMappings(_newMappings: Record<string, string>): void {
  // 没入モード用: フェーズ6でコメントアウト済み
}

/** @deprecated 没入モード用 — フェーズ6では InlayHints API に移行済み */
export function getCurrentMappings(): Readonly<Record<string, string>> {
  return {};
}
