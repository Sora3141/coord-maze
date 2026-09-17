let openCount = 0;

/** 確認ダイアログが開いているか。ページ側のキー操作を止めるのに使う。 */
export const isDialogOpen = () => openCount > 0;

/**
 * 確認ダイアログ。押し間違いで進行が消える操作の前に挟む。
 * 開いている間はキー入力をページ側に渡さない (Enter で実行、Esc で中止)。
 */
export function confirmDialog({ title, body, okLabel = 'はい', cancelLabel = 'やめる' }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';

    const sheet = document.createElement('div');
    sheet.className = 'sheet';
    const h = document.createElement('h2');
    h.textContent = title;
    const p = document.createElement('p');
    p.className = 'confirm-body';
    p.textContent = body;
    const ok = document.createElement('button');
    ok.className = 'primary';
    ok.textContent = okLabel;
    const cancel = document.createElement('button');
    cancel.textContent = cancelLabel;
    sheet.append(h, p, ok, cancel);
    overlay.appendChild(sheet);

    let closed = false;
    const close = (value) => {
      if (closed) return;
      closed = true;
      openCount--;
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve(value);
    };
    const onKey = (e) => {
      // ダイアログが出ている間は、下のページにキーを届けない。
      e.stopPropagation();
      if (e.code === 'Escape') { e.preventDefault(); close(false); }
      if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); close(true); }
    };

    ok.addEventListener('click', () => close(true));
    cancel.addEventListener('click', () => close(false));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
    openCount++;
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
    ok.focus();
  });
}
