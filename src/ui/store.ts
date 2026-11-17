// Хранилище партий.
//
// Каждая партия — отдельный документ games/<id> в облачном хранилище страницы на claude.ai
// (возможность `db`) + копия в памяти браузера. Снимки начала ходов — games/<id>/turns/t<N>.
// Облако — главное: память браузера в приложении Claude на телефоне бывает временной.
// Вне claude.ai (например, на GitHub Pages) работает только память браузера.
//
// Какая копия новее, решает счётчик сохранений `rev` (растёт с каждым сохранением партии),
// а не часы устройства. Записи в облако идут строго по одной: следующая — только после того,
// как предыдущая действительно завершилась, поэтому старая запись не может «догнать» новую.
import type { GameState } from '../engine/types';

export const TURN_SLOTS = 40;
const DEBOUNCE_MS = 400;
const USE_TIMEOUT_MS = 12000;
const READ_TIMEOUT_MS = 12000;
const SLOW_WRITE_MS = 15000;
const RETRY_MS = 6000;
const INDEX_KEY = 'mm-games-v2';
const gameKey = (id: string) => `mm-game-v2-${id}`;
const turnsKey = (id: string) => `mm-turns-v2-${id}`;
// Старое сохранение одной партии в памяти браузера (до списка партий).
const LEGACY_LOCAL_KEY = 'moskva-magnat-save-v1';
/** Ошибки, которые повтором не исправить. */
const FATAL_CODES = ['invalid_argument', 'quota_exceeded', 'revoked', 'not_granted', 'permission_denied'];

type Snap = { id: string; exists: boolean; data(): Record<string, unknown> | undefined };
type DocRef = {
  get(): Promise<Snap>;
  set(d: Record<string, unknown>): Promise<void>;
  update(d: Record<string, unknown>): Promise<void>;
};
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
  rev: number;
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

export interface LoadResult {
  state: GameState;
  rev: number;
  /** Облако не ответило — открыта версия с этого устройства. */
  cloudUnchecked: boolean;
}

export type SaveStatus =
  | { kind: 'pending' } // ещё подключаемся к облаку
  | { kind: 'cloud'; at: string } // последнее сохранение дошло до облака
  | { kind: 'local'; at: string } // облака на этом устройстве нет совсем
  | { kind: 'error'; at: string; code?: string; fatal?: boolean } // запись не прошла
  | { kind: 'conflict'; turn: number }; // в облаке более новая версия этой партии

interface StoredLocal {
  json: string;
  savedAt: string;
  rev: number;
}

interface QueueItem {
  op: 'set' | 'update';
  data: Record<string, unknown>;
  /** Для документа партии — какой rev он несёт (для проверки конфликта). */
  gameId?: string;
}

function timeout<T>(p: Promise<T>, ms: number): Promise<T | typeof TIMEOUT> {
  return Promise.race([p, new Promise<typeof TIMEOUT>((r) => setTimeout(() => r(TIMEOUT), ms))]);
}
const TIMEOUT = Symbol('timeout');

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

function playersOf(s: GameState): PlayerMeta[] {
  return s.players.map((p) => ({ name: p.name, token: p.token, color: p.color, money: p.money, bankrupt: p.bankrupt }));
}

/** Какая из двух копий новее: по счётчику сохранений, затем по ходу. */
function newer<T extends { rev: number; turn: number }>(a: T, b: T): T {
  if (a.rev !== b.rev) return a.rev > b.rev ? a : b;
  return a.turn >= b.turn ? a : b;
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

function lsRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function errCode(e: unknown): string {
  const c = (e as { code?: unknown })?.code;
  return typeof c === 'string' ? c : '';
}

/** Снимок для истории ходов — без журнала, чтобы был компактнее. */
function compact(s: GameState): string {
  return JSON.stringify({ ...s, log: s.log.slice(-5) });
}

export class GameStore {
  status: SaveStatus = { kind: 'pending' };
  /** Вызывается при каждой смене статуса сохранения. */
  onStatus: (() => void) | null = null;

  private dbPromise: Promise<Db | null>;
  private db: Db | null = null;
  /** Облака на этом устройстве нет совсем (use('db') ответил null). */
  private noCloud = false;
  private queue = new Map<string, QueueItem>();
  /** Счётчик сохранений каждой партии (известный этому устройству). */
  private revs = new Map<string, number>();
  /** rev, с которого началась работа с партией в этом сеансе (для проверки конфликта). */
  private baseRev = new Map<string, number>();
  /** Партии, для которых уже сверились с облаком перед первой записью. */
  private verified = new Set<string>();
  /** Партии, в которые писать нельзя: в облаке более новая версия. */
  private blocked = new Set<string>();
  private lastTurn = new Map<string, number>();
  private timer: number | null = null;
  private running = false;

  constructor() {
    const c = (window as unknown as { claude?: ClaudeGlobal }).claude;
    this.dbPromise = c?.use ? (c.use('db') as Promise<Db | null>).catch(() => null) : Promise.resolve(null);
    void this.dbPromise.then((db) => {
      this.db = db;
      if (!db) {
        this.noCloud = true;
        this.setStatus({ kind: 'local', at: '' });
      } else if (this.status.kind === 'pending') {
        this.flush();
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flush();
    });
    window.addEventListener('pagehide', () => this.flush());
    window.addEventListener('beforeunload', () => this.flush());
  }

  /** Облако, если уже подключено; ждёт не дольше `ms`. Таймаут — не «облака нет», а «пока нет». */
  private async getDb(ms = USE_TIMEOUT_MS): Promise<Db | null> {
    if (this.db || this.noCloud) return this.db;
    const r = await timeout(this.dbPromise, ms);
    return r === TIMEOUT ? null : r;
  }

  // ——————————————— Партии в этом сеансе ———————————————

  /** Сообщить хранилищу, что партия открыта (после загрузки, отката, импорта или новой игры). */
  opened(id: string, state: GameState, rev: number): void {
    this.revs.set(id, rev);
    this.baseRev.set(id, rev);
    this.lastTurn.set(id, state.turnNumber);
    this.blocked.delete(id);
    this.verified.delete(id);
  }

  revOf(id: string): number {
    return this.revs.get(id) ?? 0;
  }

  // ——————————————— Запись ———————————————

  save(id: string, state: GameState): void {
    if (this.blocked.has(id)) return;
    const now = new Date().toISOString();
    const rev = (this.revs.get(id) ?? 0) + 1;
    this.revs.set(id, rev);
    const json = JSON.stringify(state);
    const meta = {
      savedAt: now,
      rev,
      turn: state.turnNumber,
      players: playersOf(state),
      finished: state.phase === 'gameover',
    };

    // 1. Память браузера — сразу.
    lsSet(gameKey(id), JSON.stringify({ json, savedAt: now, rev } satisfies StoredLocal));
    const index = this.localIndex().filter((m) => m.id !== id);
    index.unshift({ id, ...meta, where: 'local' });
    lsSet(INDEX_KEY, JSON.stringify(index.slice(0, 60)));

    // 2. Облако — пакетом (если пришло новее до записи — пишется только новое).
    this.queue.set(`games/${id}`, { op: 'set', data: { ...meta, json }, gameId: id });
    if (this.lastTurn.get(id) !== state.turnNumber) {
      this.lastTurn.set(id, state.turnNumber);
      const snap = compact(state);
      this.queue.set(`games/${id}/turns/t${state.turnNumber % TURN_SLOTS}`, {
        op: 'set',
        data: { turn: state.turnNumber, savedAt: now, json: snap },
      });
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

  private retryLater(): void {
    if (this.timer === null) this.timer = window.setTimeout(() => this.flush(), RETRY_MS);
  }

  private async loop(): Promise<void> {
    this.running = true;
    try {
      const db = await this.getDb();
      if (!db) {
        if (this.noCloud) {
          this.queue.clear(); // облака нет совсем — всё уже лежит в памяти браузера
          this.setStatus({ kind: 'local', at: new Date().toISOString() });
        } else {
          this.setStatus({ kind: 'error', at: new Date().toISOString(), code: 'нет связи с облаком' });
          this.retryLater();
        }
        return;
      }
      while (this.queue.size) {
        const [path, item] = this.queue.entries().next().value as [string, QueueItem];
        if (item.gameId && this.blocked.has(item.gameId)) {
          this.queue.delete(path);
          continue;
        }
        // Перед первой записью партии в этом сеансе — сверяемся с облаком.
        if (item.gameId && !this.verified.has(item.gameId)) {
          const ok = await this.verify(db, item.gameId);
          if (ok === 'retry') {
            this.retryLater();
            return;
          }
          if (ok === 'conflict') continue;
        }
        this.queue.delete(path);
        const write = item.op === 'set' ? db.doc(path).set(item.data) : db.doc(path).update(item.data);
        // Ждём, пока запись действительно завершится — даже долгую. Предупреждаем, если долго.
        const slow = window.setTimeout(
          () => this.setStatus({ kind: 'error', at: new Date().toISOString(), code: 'облако отвечает медленно' }),
          SLOW_WRITE_MS,
        );
        try {
          await write;
          window.clearTimeout(slow);
          if (!path.includes('/turns/')) this.setStatus({ kind: 'cloud', at: new Date().toISOString() });
        } catch (e) {
          window.clearTimeout(slow);
          const code = errCode(e);
          const fatal = FATAL_CODES.includes(code);
          if (!fatal && !this.queue.has(path)) this.queue.set(path, item); // вернём и повторим позже
          this.setStatus({ kind: 'error', at: new Date().toISOString(), code, fatal });
          if (!fatal) this.retryLater();
          return;
        }
      }
    } finally {
      this.running = false;
    }
  }

  /** Нет ли в облаке более новой версии партии (например, с другого устройства). */
  private async verify(db: Db, id: string): Promise<'ok' | 'conflict' | 'retry'> {
    try {
      const r = await timeout(db.doc(`games/${id}`).get(), READ_TIMEOUT_MS);
      if (r === TIMEOUT) return 'retry';
      const d = r.exists ? r.data() : undefined;
      const cloudRev = d ? Number(d.rev ?? 0) : 0;
      if (d && cloudRev > (this.baseRev.get(id) ?? 0)) {
        this.blocked.add(id);
        for (const k of [...this.queue.keys()]) if (k.startsWith(`games/${id}`)) this.queue.delete(k);
        this.setStatus({ kind: 'conflict', turn: Number(d.turn ?? 0) });
        return 'conflict';
      }
      this.verified.add(id);
      return 'ok';
    } catch {
      return 'retry';
    }
  }

  private setStatus(s: SaveStatus): void {
    this.status = s;
    this.onStatus?.();
  }

  // ——————————————— Чтение ———————————————

  private localIndex(): GameMeta[] {
    try {
      const list = JSON.parse(lsGet(INDEX_KEY) ?? '[]') as GameMeta[];
      return Array.isArray(list) ? list.map((m) => ({ ...m, rev: Number(m.rev ?? 0) })) : [];
    } catch {
      return [];
    }
  }

  /** Все незавершённые партии: из облака и с этого устройства, свежие сверху. */
  async listGames(): Promise<{ games: GameMeta[]; cloudOk: boolean }> {
    const byId = new Map<string, GameMeta>();
    for (const m of this.localIndex()) byId.set(m.id, { ...m, where: 'local' });
    let cloudOk = this.noCloud;
    const db = await this.getDb();
    if (db) {
      try {
        const r = await timeout(db.collection('games').get(), READ_TIMEOUT_MS);
        if (r !== TIMEOUT) {
          cloudOk = true;
          for (const d of r.docs) {
            const data = d.data();
            if (!data || typeof data.savedAt !== 'string') continue;
            const cloud: GameMeta = {
              id: d.id,
              savedAt: data.savedAt,
              rev: Number(data.rev ?? 0),
              turn: Number(data.turn ?? 0),
              players: (data.players as PlayerMeta[]) ?? [],
              finished: !!data.finished,
              where: 'cloud',
            };
            const local = byId.get(d.id);
            if (!local) {
              byId.set(d.id, cloud);
            } else {
              const best = newer(local, cloud);
              // «Убрана из списка» в любой копии, не старше выбранной, — значит убрана.
              const finished = best.finished || ((best === local ? cloud : local).finished && (best === local ? cloud : local).rev >= best.rev);
              byId.set(d.id, { ...best, finished, where: 'both' });
            }
          }
        }
      } catch {
        /* облако не ответило — покажем то, что есть на устройстве */
      }
    }
    if (cloudOk) this.importLegacy(byId);
    const games = [...byId.values()].filter((m) => !m.finished).sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
    return { games, cloudOk };
  }

  /** Самая свежая версия партии. Если облако не ответило — версия с устройства с пометкой. */
  async load(id: string): Promise<LoadResult | null> {
    let local: StoredLocal | null = null;
    try {
      const raw = lsGet(gameKey(id));
      if (raw) {
        const l = JSON.parse(raw) as StoredLocal;
        local = { ...l, rev: Number(l.rev ?? 0) };
      }
    } catch {
      /* ignore */
    }
    let cloud: StoredLocal | null = null;
    let cloudUnchecked = !this.noCloud;
    const db = await this.getDb();
    if (db) {
      for (let attempt = 0; attempt < 2 && cloudUnchecked; attempt++) {
        try {
          const r = await timeout(db.doc(`games/${id}`).get(), READ_TIMEOUT_MS);
          if (r === TIMEOUT) continue;
          cloudUnchecked = false;
          const d = r.exists ? r.data() : undefined;
          if (d && typeof d.json === 'string') cloud = { json: d.json, savedAt: String(d.savedAt ?? ''), rev: Number(d.rev ?? 0) };
        } catch {
          /* следующая попытка */
        }
      }
    }
    const pick = (x: StoredLocal | null) => (x ? { ...x, turn: parseState(x.json)?.turnNumber ?? 0 } : null);
    const a = pick(local);
    const b = pick(cloud);
    const best = a && b ? newer(a, b) : (a ?? b);
    const state = best ? parseState(best.json) : null;
    if (!state || !best) return null;
    return { state, rev: best.rev, cloudUnchecked };
  }

  /** Снимки начала ходов партии — для отката. Новые сверху; не новее текущего хода. */
  async listTurns(id: string, upToTurn: number): Promise<TurnSnap[]> {
    const byTurn = new Map<number, TurnSnap>();
    const add = (turn: number, savedAt: string, json: string) => {
      if (turn > upToTurn) return; // ветка, от которой откатились
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
    const db = await this.getDb();
    if (db) {
      try {
        const r = await timeout(db.collection(`games/${id}/turns`).get(), READ_TIMEOUT_MS);
        if (r !== TIMEOUT) {
          for (const d of r.docs) {
            const data = d.data();
            if (data && typeof data.json === 'string') add(Number(data.turn), String(data.savedAt ?? ''), data.json);
          }
        }
      } catch {
        /* ignore */
      }
    }
    return [...byTurn.values()].sort((a, b) => b.turn - a.turn);
  }

  /** Убрать партию из списка (данные остаются, партия помечается завершённой). */
  hide(id: string): void {
    const rev = Math.max(this.revs.get(id) ?? 0, ...this.localIndex().filter((m) => m.id === id).map((m) => m.rev)) + 1;
    this.revs.set(id, rev);
    const index = this.localIndex().map((m) => (m.id === id ? { ...m, finished: true, rev } : m));
    lsSet(INDEX_KEY, JSON.stringify(index));
    this.blocked.delete(id);
    this.verified.add(id);
    this.queue.set(`games/${id}`, { op: 'update', data: { finished: true, rev }, gameId: id });
    this.flush();
  }

  /** Переносит сохранение старого формата (одна партия в памяти браузера) в список партий — один раз. */
  private importLegacy(byId: Map<string, GameMeta>): void {
    const raw = lsGet(LEGACY_LOCAL_KEY);
    if (!raw) return;
    lsRemove(LEGACY_LOCAL_KEY);
    const state = parseState(raw);
    if (!state || state.phase === 'gameover' || byId.has('legacy')) return;
    this.opened('legacy', state, 0);
    this.save('legacy', state);
    byId.set('legacy', {
      id: 'legacy',
      savedAt: new Date().toISOString(),
      rev: 1,
      turn: state.turnNumber,
      players: playersOf(state),
      finished: false,
      where: 'local',
    });
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
