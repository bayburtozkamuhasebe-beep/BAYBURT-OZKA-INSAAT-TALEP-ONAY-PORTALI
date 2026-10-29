/**
 * Security Guard: Prevents Inspect Element, F12, DevTools shortcuts, View Source,
 * and silences sensitive console logs so internal codes and credentials are protected.
 */

export function initSecurityGuard(): void {
  if (typeof window === 'undefined') return;

  // 1. Sağ Tık (Context Menu / İncele) Engelleme
  window.addEventListener(
    'contextmenu',
    (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      return false;
    },
    { capture: true }
  );

  // 2. F12, Geliştirici Araçları ve Kaynak Kodu Kısayollarını Engelleme
  window.addEventListener(
    'keydown',
    (e: KeyboardEvent) => {
      // F12 tuşu
      if (e.key === 'F12' || e.keyCode === 123) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }

      const isCtrlOrMeta = e.ctrlKey || e.metaKey;

      // Ctrl + Shift + I (İncele / DevTools)
      // Ctrl + Shift + J (Konsol)
      // Ctrl + Shift + C (Eleman Seçici)
      // Ctrl + Shift + K (Firefox Konsol)
      if (isCtrlOrMeta && e.shiftKey) {
        const k = e.key ? e.key.toUpperCase() : '';
        if (k === 'I' || k === 'J' || k === 'C' || k === 'K' || e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67 || e.keyCode === 75) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
      }

      // Ctrl + U (Kaynak Kodunu Görüntüle / View Source)
      // Ctrl + S (Sayfayı Kaydet)
      if (isCtrlOrMeta) {
        const k = e.key ? e.key.toUpperCase() : '';
        if (k === 'U' || k === 'S' || e.keyCode === 85 || e.keyCode === 83) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
      }

      // Mac: Cmd + Alt + I, Cmd + Alt + J, Cmd + Alt + C
      if (e.metaKey && e.altKey) {
        const k = e.key ? e.key.toUpperCase() : '';
        if (k === 'I' || k === 'J' || k === 'C') {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
      }
    },
    { capture: true }
  );

  // 3. Sürükle-Bırak Kod Kopyalamayı Engelleme
  window.addEventListener(
    'dragstart',
    (e: DragEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'IMG') {
        e.preventDefault();
      }
    },
    { capture: true }
  );

  // 4. Konsol Loglarını Sessize Alma (Gizlilik & Güvenlik)
  try {
    const noop = () => {};
    window.console.log = noop;
    window.console.info = noop;
    window.console.debug = noop;
    window.console.dir = noop;
    window.console.table = noop;
  } catch {
    // ignore
  }
}
