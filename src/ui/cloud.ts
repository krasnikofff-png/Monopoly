// Облачное сохранение партии: личный документ игрока в хранилище страницы на claude.ai
// (возможность `db`, путь data/users/<id>/ виден только самому игроку).
// Вне claude.ai (например, на GitHub Pages) просто ничего не делает.

type Snap = { exists: boolean; data(): Record<string, unknown> | undefined };
type DocRef = { get(): Promise<Snap>; set(d: Record<string, unknown>): Promise<void> };
type ClaudeGlobal = { use?: (name: string) => Promise<unknown> };

const DEBOUNCE_MS = 1500;

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
  private ref: Promise<DocRef | null>;
  private pending: string | null = null;
  private timer: number | null = null;
  private running = false;

  constructor() {
    this.ref = this.init();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flushNow();
    });
    window.addEventListener('pagehide', () => this.flushNow());
  }

  private async init(): Promise<DocRef | null> {
    const c = (window as unknown as { claude?: ClaudeGlobal }).claude;
    if (!c?.use) return null;
    try {
      const [db, user] = (await Promise.all([c.use('db'), c.use('user')])) as [
        { doc(path: string): DocRef } | null,
        { id(): Promise<string | null> } | null,
      ];
      if (!db || !user) return null;
      const id = await user.id();
      if (!id) return null;
      return db.doc(`data/users/${id}/saves/current`);
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

  flushNow(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.running && this.pending !== null) void this.loop();
  }

  private async loop(): Promise<void> {
    this.running = true;
    const ref = await this.ref.catch(() => null);
    // Одна запись за раз; если пока писали пришло новое состояние — пишем его следом.
    while (ref && this.pending !== null) {
      const json = this.pending;
      this.pending = null;
      try {
        await ref.set({ json, savedAt: new Date().toISOString() });
      } catch {
        /* следующая попытка — со следующим ходом */
      }
    }
    this.running = false;
  }
}
