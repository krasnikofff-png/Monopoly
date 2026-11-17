import './ui/styles.css';
import { App } from './ui/app';
import type { GameState } from './engine/types';

// При обновлении опубликованной страницы claude.ai передаёт новой версии снимок
// текущей партии — так игра продолжается без перезапуска.
type Hot = {
  data?: { state?: GameState };
  ready?: (start: (data: { state?: GameState }) => void) => void;
  snapshot?: (fn: () => unknown) => void;
};
const hot = (window as unknown as { claude?: { hot?: Hot } }).claude?.hot;

function start(data: { state?: GameState } = {}): void {
  const app = new App(document.getElementById('app')!, data?.state ?? null);
  try {
    hot?.snapshot?.(() => ({ state: app.snapshot() ?? undefined }));
  } catch {
    /* механизм обновления недоступен */
  }
}

if (hot?.ready) hot.ready(start);
else start(hot?.data ?? {});
