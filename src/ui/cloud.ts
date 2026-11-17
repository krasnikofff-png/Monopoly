// Облачное сохранение партии: личный документ игрока в хранилище страницы на claude.ai
// (возможность `db`, путь data/users/<id>/ виден только самому игроку).
// Вне claude.ai (например, на GitHub Pages) просто ничего не делает.

type Snap = { id?: string; exists: boolean; data(): Record<string, unknown> | undefined };
type DocRef = { get(): Promise<Snap>; set(d: Record<string, unknown>): Promise<void> };
type ColRef = { doc(id: string): DocRef; get(): Promise<{ docs: Snap[] }> };
type ClaudeGlobal = { use?: (name: string) => Promise<unknown> };

const DEBOUNCE_MS = 1500;
/** Сколько снимков (по одному на ход) хранить для отката. */
export const HISTORY_SLOTS = 15;

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

export interface CloudPayload {
  json: string;
  savedAt: string;
}

export class CloudSave {
  private col: Promise<ColRef | null>;
  private ref: Promise<DocRef | null>;
  private pending: string | null = null;
  /** Снимки ходов, ожидающие записи: имя документа → json. */
  private history = new Map<string, string>();
  private timer: number | null = null;
  private running = false;

  constructor() {
    this.col = this.init();
    this.ref = this.col.then((c) => (c ? c.doc('current') : null));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flushNow();
    });
    window.addEventListener('pagehide', () => this.flushNow());
  }

  private async init(): Promise<ColRef | null> {
    const c = (window as unknown as { claude?: ClaudeGlobal }).claude;
    if (!c?.use) return null;
    try {
      const [db, user] = (await Promise.all([c.use('db'), c.use('user')])) as [
        { collection(path: string): ColRef } | null,
        { id(): Promise<string | null> } | null,
      ];
      if (!db || !user) return null;
      const id = await user.id();
      if (!id) return null;
      return db.collection(`data/users/${id}/saves`);
    } catch {
      return null;
    }
  }

  /** Последнее облачное сохранение (или null). */
  async load(): Promise<CloudPayload | null> {
    try {
      const ref = await withTimeout(this.ref, 12000);
      if (!ref) return null;
      const snap = await withTimeout(ref.get(), 10000);
      const d = snap.exists ? snap.data() : undefined;
      if (d && typeof d.json === 'string') return { json: d.json, savedAt: String(d.savedAt ?? '') };
    } catch {
      /* нет сети или хранилища — работаем с локальным сохранением */
    }
    return null;
  }

  /** Запоминает состояние; запись в облако — пакетом, не чаще раза в 1,5 с. */
  save(json: string): void {
    this.pending = json;
    if (this.timer === null) this.timer = window.setTimeout(() => this.flushNow(), DEBOUNCE_MS);
  }

  /** Снимок начала хода — для «Вернуть партию назад». */
  saveTurn(turn: number, json: string): void {
    this.history.set(`h${turn % HISTORY_SLOTS}`, json);
    this.flushNow();
  }

  /** Все снимки ходов из облака. */
  async loadHistory(): Promise<CloudPayload[]> {
    try {
      const col = await withTimeout(this.col, 12000);
      if (!col) return [];
      const q = await withTimeout(col.get(), 10000);
      return q.docs
        .filter((d) => d.id?.startsWith('h'))
        .map((d) => d.data())
        .filter((d): d is Record<string, unknown> => !!d && typeof d.json === 'string')
        .map((d) => ({ json: d.json as string, savedAt: String(d.savedAt ?? '') }));
    } catch {
      return [];
    }
  }

  flushNow(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.running && (this.pending !== null || this.history.size)) void this.loop();
  }

  private async loop(): Promise<void> {
    this.running = true;
    const col = await this.col.catch(() => null);
    // Одна запись за раз; если пока писали пришло новое состояние — пишем его следом.
    while (col && (this.pending !== null || this.history.size)) {
      let name = 'current';
      let json: string;
      if (this.pending !== null) {
        json = this.pending;
        this.pending = null;
      } else {
        const [k, v] = this.history.entries().next().value as [string, string];
        this.history.delete(k);
        name = k;
        json = v;
      }
      try {
        await col.doc(name).set({ json, savedAt: new Date().toISOString() });
      } catch {
        /* следующая попытка — со следующим ходом */
      }
    }
    this.running = false;
  }
}
