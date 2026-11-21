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

// Игра без интернета: на своём сайте (не внутри claude.ai) ставим сервис-воркер.
if (import.meta.env.PROD && 'serviceWorker' in navigator && document.querySelector('link[rel="manifest"]') && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* без офлайна — игра всё равно работает */
    });
  });
}
