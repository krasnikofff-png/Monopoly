import './ui/fonts.css';
import './ui/styles.css';
import { App } from './ui/app';
import type { GameState } from './engine/types';

// При обновлении опубликованной страницы claude.ai передаёт новой версии снимок
// текущей партии — так игра продолжается без перезапуска.
type Snapshot = { state?: GameState; gameId?: string; rev?: number; undo?: { state: GameState; player: number } };
type Hot = {
  data?: Snapshot;
  ready?: (start: (data: Snapshot) => void) => void;
  snapshot?: (fn: () => unknown) => void;
};
const hot = (window as unknown as { claude?: { hot?: Hot } }).claude?.hot;

// Если что-то пошло не так — не «зависаем» молча, а предлагаем перезапуск.
// Партия сохраняется после каждого действия, и после перезапуска игра откроет её сама.
let crashShown = false;
function showCrash(err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  try {
    localStorage.setItem('mm-last-error', `${new Date().toISOString()} ${msg}`.slice(0, 500));
  } catch {
    /* ignore */
  }
  if (crashShown) return;
  crashShown = true;
  const box = document.createElement('div');
  box.className = 'crash';
  box.innerHTML = `<div class="crash-card"><b>Что-то пошло не так</b>
    <span>Партия сохранена. Нажмите «Перезапустить» — игра откроется с того же места.</span>
    <small></small>
    <button>Перезапустить</button></div>`;
  box.querySelector('small')!.textContent = msg.slice(0, 160);
  box.querySelector('button')!.addEventListener('click', () => location.reload());
  document.body.appendChild(box);
}
window.addEventListener('error', (e) => {
  // Служебные сообщения браузера и чужих скриптов — не поломка игры.
  if (!e.error || /ResizeObserver|Script error/i.test(e.message ?? '')) return;
  showCrash(e.error);
});

function start(data: Snapshot = {}): void {
  const app = new App(document.getElementById('app')!, data ?? null);
  try {
    hot?.snapshot?.(() => app.snapshot());
  } catch {
    /* механизм обновления недоступен */
  }
}

if (hot?.ready) hot.ready(start);
else start(hot?.data ?? {});

// Просим браузер не удалять сохранения при нехватке места.
void navigator.storage?.persist?.().catch(() => false);

// Игра без интернета: на своём сайте (не внутри claude.ai) ставим сервис-воркер.
if (import.meta.env.PROD && 'serviceWorker' in navigator && document.querySelector('link[rel="manifest"]') && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* без офлайна — игра всё равно работает */
    });
  });
}
