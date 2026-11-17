// Хранилище партий.
//
// Каждая партия — отдельный документ games/<id> в облачном хранилище страницы на claude.ai
// (возможность `db`) + копия в памяти браузера. Снимки начала ходов — games/<id>/turns/t<N>.
// Облако — главное: память браузера в приложении Claude на телефоне бывает временной.
// Вне claude.ai (например, на GitHub Pages) работает только память браузера.
import type { GameState } from '../engine/types';

export const TURN_SLOTS = 40;
const DEBOUNCE_MS = 1200;
const INDEX_KEY = 'mm-games-v2';
const gameKey = (id: string) => `mm-game-v2-${id}`;
const turnsKey = (id: string) => `mm-turns-v2-${id}`;
// Старые сохранения (до этой версии) — переносятся в список партий.
const LEGACY_LOCAL_KEY = 'moskva-magnat-save-v1';

type Snap = { id: string; exists: boolean; data(): Record<string, unknown> | undefined };
type DocRef = { get(): Promise<Snap>; set(d: Record<string, unknown>): Promise<void> };
type ColRef = { get(): Promise<{ docs: Snap[] }> };
type Db = { doc(path: string): DocRef; collection(path: string): ColRef };
type ClaudeGlobal = { use?: (name: string) => Promise<unknown> };

export interface PlayerMeta {
  name: string;
  token: string;
  color: string;
  money: number;
  bankrupt: boolean;
}

export interface GameMeta {
  id: string;
  savedAt: string;
  turn: number;
  players: PlayerMeta[];
  finished: boolean;
  /** Где лежит: в облаке, только на этом устройстве или и там и там. */
  where: 'cloud' | 'local' | 'both';
}

export interface TurnSnap {
  turn: number;
  savedAt: string;
  state: GameState;
}

export type SaveStatus =
  | { kind: 'pending' } // ещё не знаем, доступно ли облако
  | { kind: 'cloud'; at: string } // последнее сохранение дошло до облака
  | { kind: 'local'; at: string } // облака нет — только память этого устройства
  | { kind: 'error'; at: string }; // облако есть, но последняя запись не прошла

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export function parseState(json: string): GameState | null {
  try {
    const s = JSON.parse(json) as GameState;
    if (s && s.version === 1 && Array.isArray(s.players) && Array.isArray(s.cells) && s.cells.length === 40) return s;
  } catch {
    /* повреждённые данные */
  }
  return null;
}

export function newGameId(): string {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `g${stamp}-${Math.random().toString(36).slice(2, 8)}`;
}

function metaOf(id: string, s: GameState, savedAt: string, where: GameMeta['where']): GameMeta {
  return {
    id,
    savedAt,
    turn: s.turnNumber,
    players: s.players.map((p) => ({ name: p.name, token: p.token, color: p.color, money: p.money, bankrupt: p.bankrupt })),
    finished: s.phase === 'gameover',
    where,
  };
}

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function lsSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* память браузера недоступна или переполнена */
  }
}

/** Снимок для истории ходов — без журнала, чтобы был компактнее. */
function compact(s: GameState): string {
  return JSON.stringify({ ...s, log: s.log.slice(-5) });
}

export class GameStore {
  status: SaveStatus = { kind: 'pending' };
  /** Вызывается при каждой смене статуса сохранения. */
  onStatus: (() => void) | null = null;

  private db: Promise<Db | null>;
  private queue = new Map<string, Record<string, unknown>>();
  private lastTurn = new Map<string, number>();
  private timer: number | null = null;
  private running = false;

  constructor() {
    const c = (window as unknown as { claude?: ClaudeGlobal }).claude;
    const use = (name: string) =>
      c?.use ? withTimeout(c.use(name), 12000).catch(() => null) : Promise.resolve(null);
    this.db = use('db') as Promise<Db | null>;
    void this.db.then((db) => {
      if (!db && this.status.kind === 'pending') this.setStatus({ kind: 'local', at: '' });
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flush();
    });
    window.addEventListener('pagehide', () => this.flush());
  }

  /** Есть ли облако на этом устройстве (ждёт ответа до 12 с). */
  async cloudAvailable(): Promise<boolean> {
    return !!(await this.db);
  }

  // ——————————————— Запись ———————————————

  save(id: string, state: GameState): void {
    const now = new Date().toISOString();
    const json = JSON.stringify(state);
    const meta = metaOf(id, state, now, 'local');

    // 1. Память браузера — сразу.
    lsSet(gameKey(id), JSON.stringify({ json, savedAt: now }));
    const index = this.localIndex().filter((m) => m.id !== id);
    index.unshift(meta);
    lsSet(INDEX_KEY, JSON.stringify(index.slice(0, 30)));

    // 2. Облако — пакетом.
    const { where: _w, ...cloudMeta } = meta;
    this.queue.set(`games/${id}`, { ...cloudMeta, json });
    if (this.lastTurn.get(id) !== state.turnNumber) {
      this.lastTurn.set(id, state.turnNumber);
      const snap = compact(state);
      this.queue.set(`games/${id}/turns/t${state.turnNumber % TURN_SLOTS}`, { turn: state.turnNumber, savedAt: now, json: snap });
      try {
        const turns = JSON.parse(lsGet(turnsKey(id)) ?? '[]') as { turn: number; savedAt: string; json: string }[];
        const next = turns.filter((t) => t.turn !== state.turnNumber);
        next.push({ turn: state.turnNumber, savedAt: now, json: snap });
        lsSet(turnsKey(id), JSON.stringify(next.slice(-TURN_SLOTS)));
      } catch {
        /* ignore */
      }
    }
    if (this.timer === null) this.timer = window.setTimeout(() => this.flush(), DEBOUNCE_MS);
  }

  /** Отправить всё накопленное в облако прямо сейчас. */
  flush(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.running && this.queue.size) void this.loop();
  }

  private async loop(): Promise<void> {
    this.running = true;
    const db = await this.db;
    if (!db) {
      this.queue.clear();
      this.running = false;
      this.setStatus({ kind: 'local', at: new Date().toISOString() });
      return;
    }
    // По одной записи за раз; что пришло за время записи — пишется следом.
    while (this.queue.size) {
      const [path, data] = this.queue.entries().next().value as [string, Record<string, unknown>];
      this.queue.delete(path);
      try {
        await withTimeout(db.doc(path).set(data), 15000);
        if (!path.includes('/turns/')) this.setStatus({ kind: 'cloud', at: new Date().toISOString() });
      } catch {
        // Не дошло — вернём в очередь (если не пришло более свежее) и попробуем позже.
        if (!this.queue.has(path)) this.queue.set(path, data);
        this.setStatus({ kind: 'error', at: new Date().toISOString() });
        this.running = false;
        if (this.timer === null) this.timer = window.setTimeout(() => this.flush(), 8000);
        return;
      }
    }
    this.running = false;
  }

  private setStatus(s: SaveStatus): void {
    this.status = s;
    this.onStatus?.();
  }

  // ——————————————— Чтение ———————————————

  private localIndex(): GameMeta[] {
    try {
      const list = JSON.parse(lsGet(INDEX_KEY) ?? '[]') as GameMeta[];
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  /** Все незавершённые партии: из облака и с этого устройства, свежие сверху. */
  async listGames(): Promise<GameMeta[]> {
    const byId = new Map<string, GameMeta>();
    for (const m of this.localIndex()) byId.set(m.id, { ...m, where: 'local' });
    const db = await this.db;
    if (db) {
      try {
        const q = await withTimeout(db.collection('games').get(), 12000);
        for (const d of q.docs) {
          const data = d.data();
          if (!data || typeof data.savedAt !== 'string') continue;
          const cloud: GameMeta = {
            id: d.id,
            savedAt: data.savedAt,
            turn: Number(data.turn ?? 0),
            players: (data.players as PlayerMeta[]) ?? [],
            finished: !!data.finished,
            where: 'cloud',
          };
          const local = byId.get(d.id);
          if (!local) byId.set(d.id, cloud);
          else byId.set(d.id, { ...(local.savedAt > cloud.savedAt ? local : cloud), where: 'both' });
        }
      } catch {
        /* облако не ответило — покажем то, что есть на устройстве */
      }
    }
    await this.importLegacy(byId);
    return [...byId.values()].filter((m) => !m.finished).sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
  }

  /** Самая свежая версия партии: из облака или из памяти браузера. */
  async load(id: string): Promise<GameState | null> {
    let best: { json: string; savedAt: string } | null = null;
    try {
      const raw = lsGet(gameKey(id));
      if (raw) best = JSON.parse(raw) as { json: string; savedAt: string };
    } catch {
      /* ignore */
    }
    const db = await this.db;
    if (db) {
      try {
        const snap = await withTimeout(db.doc(`games/${id}`).get(), 12000);
        const d = snap.exists ? snap.data() : undefined;
        if (d && typeof d.json === 'string' && typeof d.savedAt === 'string') {
          if (!best || d.savedAt > best.savedAt) best = { json: d.json, savedAt: d.savedAt };
        }
      } catch {
        /* ignore */
      }
    }
    return best ? parseState(best.json) : null;
  }

  /** Снимки начала ходов партии — для отката. Новые сверху. */
  async listTurns(id: string): Promise<TurnSnap[]> {
    const byTurn = new Map<number, TurnSnap>();
    const add = (turn: number, savedAt: string, json: string) => {
      const state = parseState(json);
      if (!state) return;
      const prev = byTurn.get(turn);
      if (!prev || prev.savedAt < savedAt) byTurn.set(turn, { turn, savedAt, state });
    };
    try {
      for (const t of JSON.parse(lsGet(turnsKey(id)) ?? '[]') as { turn: number; savedAt: string; json: string }[]) {
        add(t.turn, t.savedAt, t.json);
      }
    } catch {
      /* ignore */
    }
    const db = await this.db;
    if (db) {
      try {
        const q = await withTimeout(db.collection(`games/${id}/turns`).get(), 12000);
        for (const d of q.docs) {
          const data = d.data();
          if (data && typeof data.json === 'string') add(Number(data.turn), String(data.savedAt ?? ''), data.json);
        }
      } catch {
        /* ignore */
      }
    }
    return [...byTurn.values()].sort((a, b) => b.turn - a.turn);
  }

  /** Убрать партию из списка (данные остаются, просто помечается завершённой). */
  hide(id: string, state: GameState | null): void {
    const index = this.localIndex().map((m) => (m.id === id ? { ...m, finished: true } : m));
    lsSet(INDEX_KEY, JSON.stringify(index));
    if (state) {
      const now = new Date().toISOString();
      const { where: _w, ...meta } = metaOf(id, state, now, 'local');
      this.queue.set(`games/${id}`, { ...meta, finished: true, json: JSON.stringify(state) });
      this.flush();
    }
  }

  /** Переносит сохранение старого формата (одна партия в памяти браузера) в список партий.
   *  Старое облачное сохранение писалось по неверному адресу и никогда не сохранялось. */
  private async importLegacy(byId: Map<string, GameMeta>): Promise<void> {
    if (byId.has('legacy')) return;
    let best: { json: string; savedAt: string } | null = null;
    const local = lsGet(LEGACY_LOCAL_KEY);
    if (local && parseState(local)) best = { json: local, savedAt: '' };
    if (!best) return;
    const state = parseState(best.json)!;
    if (state.phase === 'gameover') return;
    const savedAt = best.savedAt || new Date(0).toISOString();
    this.save('legacy', state);
    byId.set('legacy', metaOf('legacy', state, savedAt, 'local'));
  }
}

// ——————————————— Код партии (ручной перенос) ———————————————

const CODE_PREFIX = 'MM1.';

export function exportCode(state: GameState): string {
  const json = JSON.stringify({ ...state, log: [] });
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return CODE_PREFIX + btoa(bin);
}

export function importCode(code: string): GameState | null {
  const clean = code.trim().replace(/\s+/g, '');
  if (!clean.startsWith(CODE_PREFIX)) return null;
  try {
    const bin = atob(clean.slice(CODE_PREFIX.length));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return parseState(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}
