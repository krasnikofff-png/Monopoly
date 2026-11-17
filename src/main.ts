import './ui/styles.css';
import { App } from './ui/app';
import type { GameState } from './engine/types';

// При обновлении опубликованной страницы claude.ai передаёт новой версии снимок
// текущей партии — так игра продолжается без перезапуска.
type Snapshot = { state?: GameState; gameId?: string };
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
