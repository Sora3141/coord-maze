/**
 * 圏外でも遊べるように、サービスワーカー (../sw.js) を登録する。
 *
 * 登録に失敗しても (file:// やプライベートモードなど) ゲームはそのまま動くので、
 * エラーは握りつぶす。
 */
export function installOffline() {
  if (!('serviceWorker' in navigator)) return;
  // './sw.js' はページの URL から解決されるので、スコープは /coord-maze/ になる
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
