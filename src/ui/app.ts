import { BOARD, GROUP_COLORS, JAIL_FINE, MAX_HOTELS, MAX_HOUSES, START_BONUS, STATION_RENT, UTILITY_MULT, groupCells, isOwnable } from '../data/board';
import { CARD_BY_ID } from '../data/cards';
import { botDecide, tradeGain } from '../engine/bot';
import { iconSvg, installIcons } from './icons';
import { TOKEN_NAMES, normalizeToken, tokenSvg } from './tokens';
import { randomSeed } from '../engine/rng';
import { Sound, type SoundName } from './sound';
import { GameStore, TURN_SLOTS, exportCode, importCode, newGameId, type GameMeta, type TurnSnap } from './store';
import { confetti, floatText, flyCoins, shake, tweenNumber } from './fx';
import { Game, GameError, PLAYER_COLORS, PLAYER_TOKENS, formatMoney } from '../engine/game';
import type { Action, ColorGroup, GameEvent, GameState } from '../engine/types';

type Notice = Extract<GameEvent, { kind: 'notice' }>;

const SETUP_KEY = 'moskva-magnat-setup-v1';


interface SetupRow {
  name: string;
  isBot: boolean;
  /** Выбранная фишка (car, hat, dog…). */
  token?: string;
}

/** Черновик предложения обмена, который собирает игрок. */
interface TradeDraft {
  from: number;
  to: number;
  give: number[];
  get: number[];
  giveMoney: number;
  getMoney: number;
}
const STEP_MS = 170;
const PREFS_KEY = 'moskva-magnat-prefs-v1';
const BOT_DELAY = 650;

function groupCellsBuilt(game: Game, group: ColorGroup): boolean {
  return groupCells(group).some((id) => game.state.cells[id].houses > 0);
}

const TYPE_LABEL: Record<string, string> = {
  start: 'СТАРТ',
  chance: 'ШАНС',
  surprise: 'СЮРПРИЗ',
  tax: 'НАЛОГ',
  jail: 'ТЮРЬМА',
  parking: 'ОТДЫХ',
  gotojail: 'В ТЮРЬМУ',
  property: '',
  station: '',
  utility: '',
};

const CELL_SUBTITLE: Partial<Record<string, string>> = {
  start: 'Начало круга',
  chance: 'Карточка',
  surprise: 'Карточка',
  tax: 'Обязательный платёж',
  station: 'Вокзал',
  utility: 'Коммунальное предприятие',
  jail: 'Угловая клетка',
  parking: 'Угловая клетка',
  gotojail: 'Угловая клетка',
};

const CELL_FOOT: Partial<Record<string, string>> = {
  chance: 'Тяните карточку — повезёт или нет?',
  surprise: 'Тяните карточку — повезёт или нет?',
  tax: 'Платится банку сразу.',
  station: 'Аренда 250–2 000 ₽ — зависит от числа вокзалов.',
  utility: 'Доход зависит от броска кубиков.',
  jail: 'Просто в гостях — если вас не посадили.',
  parking: 'Отдых. Здесь ничего не происходит.',
  gotojail: 'Прямиком в тюрьму, без бонуса за Старт.',
};

const GROUP_NAMES: Record<ColorGroup, string> = {
  brown: 'коричневая',
  lightblue: 'голубая',
  pink: 'розовая',
  orange: 'оранжевая',
  red: 'красная',
  yellow: 'жёлтая',
  green: 'зелёная',
  darkblue: 'синяя',
};

const stroke = (d: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

const UI_ICONS = {
  menu: stroke('<path d="M4 6h16M4 12h16M4 18h16"/>'),
  clock: stroke('<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3 4v4.5h4.5"/><path d="M12 7.5V12l3 2"/>'),
  home: stroke('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h5v-6h4v6h5V9.5"/>'),
  deal: stroke('<path d="m11 17 2 2a1.4 1.4 0 0 0 2-2"/><path d="m14 14 2.5 2.5a1.4 1.4 0 0 0 2-2l-3.9-3.9a2.1 2.1 0 0 0-3 0l-.9.9a1.4 1.4 0 0 1-2-2l2.8-2.8a4.2 4.2 0 0 1 5.2-.6l.5.3a2 2 0 0 0 1.5.2L21 6"/><path d="m21 3 1 11h-2"/><path d="M3 3 2 14l6.5 6.5a1.4 1.4 0 0 0 2-2"/><path d="M3 4h8"/>'),
  list: stroke('<rect x="4" y="3" width="16" height="18" rx="2.5"/><path d="M8 8h8M8 12h8M8 16h5"/>'),
  bank: stroke('<path d="M3 9.5 12 4l9 5.5"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8"/><path d="M3 20.5h18"/>'),
  soundOn: stroke('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>'),
  soundOff: stroke('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>'),
};

/** Фон центра поля: условная карта Москвы — река, улицы, силуэты высоток. */
const MAP_SVG = `<svg class="map" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
  <g stroke="#d9d3f3" stroke-width=".5" fill="none">
    <path d="M0 22 Q30 18 52 30 T100 34"/><path d="M0 48 Q24 52 48 46 T100 58"/><path d="M8 0 Q14 40 6 100"/>
    <path d="M30 0 Q38 30 32 62 T40 100"/><path d="M62 0 Q58 34 70 58 T64 100"/><path d="M88 0 Q80 40 92 100"/>
    <path d="M0 78 Q40 70 100 86"/><circle cx="50" cy="50" r="30"/><circle cx="50" cy="50" r="18"/>
  </g>
  <path d="M-4 70 C10 62 18 84 30 80 S48 92 60 86 S78 66 104 72" fill="none" stroke="#c9daf6" stroke-width="3.2" stroke-linecap="round"/>
  <path d="M74 -4 C70 10 84 16 80 28 S88 40 104 38" fill="none" stroke="#c9daf6" stroke-width="2.6" stroke-linecap="round"/>
  <g fill="#e2dcf7">
    <path d="M6 30 V20 H8 V16 H9 V10 L10 4 L11 10 V16 H12 V20 H14 V30 Z"/>
    <path d="M14 30 V24 H18 V22 H20 V30 Z"/>
    <path d="M76 30 V20 H78 V14 H80 V8 L81 3 L82 8 V14 H84 V20 H86 V30 Z"/>
    <path d="M70 30 V24 H74 V30 Z M88 30 V22 H92 V30 Z"/>
    <path d="M70 96 V84 H72 V78 H74 V72 L75.5 66 L77 72 V78 H79 V84 H81 V96 Z"/>
    <path d="M82 96 V88 H86 V84 H89 V96 Z M64 96 V90 H69 V96 Z"/>
  </g>
</svg>`;

/** Один и тот же код партии всегда попадает в одну и ту же запись списка. */
function importId(code: string): string {
  let h = 5381;
  for (const ch of code.trim()) h = ((h << 5) + h + ch.charCodeAt(0)) | 0;
  return `imp-${(h >>> 0).toString(36)}`;
}

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** Проверяет и разбирает сохранённую партию. */
function parseSave(json: string): GameState | null {
  try {
    const s = JSON.parse(json) as GameState;
    if (s && s.version === 1 && s.phase !== 'gameover' && Array.isArray(s.players) && Array.isArray(s.cells)) return s;
  } catch {
    /* повреждённое сохранение */
  }
  return null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/** Позиция клетки в сетке 11×11 и сторона поля. */
function gridPos(id: number): { row: number; col: number; side: 'bottom' | 'left' | 'top' | 'right' | 'corner' } {
  if (id % 10 === 0) {
    const corners = { 0: [11, 11], 10: [11, 1], 20: [1, 1], 30: [1, 11] } as Record<number, number[]>;
    const [row, col] = corners[id];
    return { row, col, side: 'corner' };
  }
  if (id < 10) return { row: 11, col: 11 - id, side: 'bottom' };
  if (id < 20) return { row: 11 - (id - 10), col: 1, side: 'left' };
  if (id < 30) return { row: 1, col: 1 + (id - 20), side: 'top' };
  return { row: 1 + (id - 30), col: 11, side: 'right' };
}

/** Фишка игрока в его цвете. */
function tk(p: { token: string; color: string }): string {
  return tokenSvg(p.token, p.color);
}

/** Подписи клеток на поле: короткие, с мягкими переносами (\u00AD) в длинных словах. */
const S = '\u00AD';
const CELL_LABELS: Record<number, string> = {
  1: `Капот${S}ня`,
  3: `Бирю${S}лёво`,
  6: `Вы${S}хино`,
  8: `Марь${S}ино`,
  9: 'Митино',
  10: 'Тюрьма',
  11: `Соколь${S}ники`,
  13: `Измай${S}лово`,
  14: 'Таганка',
  16: 'Пресня',
  18: `Хамов${S}ники`,
  19: `Замоск${S}воречье`,
  20: 'Парк',
  21: `Маро${S}сейка`,
  23: `Пок${S}ровка`,
  24: 'Чистые пруды',
  26: `Ники${S}тская`,
  27: `Твер${S}ская`,
  29: `Патри${S}аршие`,
  30: 'В тюрьму',
  31: `Осто${S}женка`,
  32: `Пречи${S}стенка`,
  34: `Кутузов${S}ский`,
  37: 'Москва-Сити',
  39: `Руб${S}лёвка`,
};

/** Иконка клетки (SVG из icons.ts). */
function cellIcon(id: number, cls = 'ico'): string {
  return iconSvg(id, cls);
}

function pips(n: number): string {
  const layout: Record<number, number[]> = {
    1: [5],
    2: [1, 9],
    3: [1, 5, 9],
    4: [1, 3, 7, 9],
    5: [1, 3, 5, 7, 9],
    6: [1, 3, 4, 6, 7, 9],
  };
  return Array.from({ length: 9 }, (_, i) => `<i class="${layout[n].includes(i + 1) ? 'on' : ''}"></i>`).join('');
}

export class App {
  private root: HTMLElement;
  private game: Game | null = null;
  /** Отображаемые позиции фишек (отстают от состояния во время анимации). */
  private shownPos: number[] = [];
  private busy = false;
  private modal: string | null = null;
  private toast: string | null = null;
  private diceShown: [number, number] = [5, 2];
  private rolling = false;
  private botTimer: number | null = null;
  private setup: SetupRow[];
  private draft: TradeDraft | null = null;
  /** Последний человек, державший телефон (для экрана передачи хода). */
  private holder: number | null = null;
  private sound = new Sound();
  private store = new GameStore();
  /** Идентификатор текущей партии в хранилище. */
  private gameId: string | null = null;
  /** Сохранённые партии для меню (null — ещё загружаются). */
  private games: GameMeta[] | null = null;
  /** Облако ответило при загрузке списка партий. */
  private gamesCloudOk = true;
  /** Снимки ходов для отката (null — ещё загружаются). */
  private histEntries: TurnSnap[] | null = null;
  private lastStatusKind = '';
  /** Номер открытой партии в этом сеансе: анимации старой партии прекращаются. */
  private gen = 0;
  /** Что сейчас происходит во время анимации (для нижней панели). */
  private busyText = '';
  /** Карточку клетки открыли из «Имущества» — «Закрыть» вернёт туда. */
  private returnToAssets = false;
  /** Состояние партии до последнего броска текущего игрока — для «Перебросить». */
  private undo: { state: GameState; player: number } | null = null;
  /** Режим ручной правки владельцев клеток. */
  private editOwners = false;
  private prefs = { sound: true, vibrate: true };
  /** Отображаемые суммы денег (плавно догоняют настоящие). */
  private shownMoney: number[] = [];
  private hopMs = STEP_MS;
  private prevCardId = -1;
  private prevModalKey: string | null = null;
  private prevCurrent = -1;
  private prevHighlight = '';
  /** Всплывающее окно-событие в центре поля. */
  private notice: (Notice & { id: number; at: number }) | null = null;
  private noticeSeq = 0;
  private noticeResolve: (() => void) | null = null;
  private prevNoticeId = -1;

  constructor(
    root: HTMLElement,
    resume?: { state?: GameState; gameId?: string; rev?: number; undo?: { state: GameState; player: number } } | null,
  ) {
    this.root = root;
    installIcons();
    this.setup = this.loadSetup();
    try {
      Object.assign(this.prefs, JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}'));
    } catch {
      /* настройки по умолчанию */
    }
    this.sound.enabled = this.prefs.sound;
    root.addEventListener('click', (e) => this.onClick(e));
    window.addEventListener('keydown', (e) => this.onKey(e));
    root.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.dataset.name !== undefined) this.setup[Number(t.dataset.name)].name = t.value;
    });
    this.store.onStatus = () => this.onSaveStatus();
    const hot = resume?.state ? parseSave(JSON.stringify(resume.state)) : null;
    if (hot) {
      const id = resume?.gameId ?? newGameId();
      this.store.opened(id, hot, resume?.rev ?? 0);
      this.startGame(new Game(hot), id);
      if (resume?.undo && resume.undo.player === hot.current) this.undo = resume.undo;
      this.save();
    } else {
      this.renderMenu();
    }
    void this.refreshGames();
  }

  /** Текущая партия — для передачи в новую версию страницы при обновлении. */
  snapshot(): { state?: GameState; gameId?: string; rev?: number; undo?: { state: GameState; player: number } } {
    this.store.flush();
    if (!this.game || this.game.state.phase === 'gameover' || !this.gameId) return {};
    return { state: this.game.state, gameId: this.gameId, rev: this.store.revOf(this.gameId), undo: this.undo ?? undefined };
  }

  private async refreshGames(): Promise<void> {
    const r = await this.store.listGames();
    this.games = r.games;
    this.gamesCloudOk = r.cloudOk;
    if (!this.game) this.renderMenu();
  }

  private onSaveStatus(): void {
    const st = this.store.status;
    if (st.kind === 'error' && this.lastStatusKind !== 'error') {
      this.showMenuToast(st.fatal ? '⚠ Облако отклонило сохранение. Сохраните код партии в меню ☰' : '⚠ Не удалось сохранить в облако — пробую снова');
    }
    if (st.kind === 'conflict' && this.lastStatusKind !== 'conflict') {
      this.modal = 'conflict';
      if (this.game) this.render();
    }
    if (st.kind === 'cloud' && this.lastStatusKind === 'error' && this.game) {
      this.showToast('☁ Сохранение снова работает');
    }
    this.lastStatusKind = st.kind;
    if (this.modal === 'settings') this.render();
  }

  private statusText(): string {
    const st = this.store.status;
    const t = (iso: string) => (iso ? new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '');
    switch (st.kind) {
      case 'pending':
        return 'Проверяем облачное сохранение…';
      case 'cloud':
        return `☁ Сохранено в облаке${t(st.at) ? `, ${t(st.at)}` : ''}`;
      case 'local':
        return '⚠ Облако недоступно — партия сохраняется только на этом устройстве. Скопируйте код партии на всякий случай.';
      case 'error':
        return st.fatal
          ? `⚠ Облако отклонило сохранение${st.code ? ` (${st.code})` : ''}. Партия сохраняется на этом телефоне — сохраните код партии.`
          : `⚠ Последнее сохранение не дошло до облака${st.code ? ` (${st.code})` : ''}${t(st.at) ? `, ${t(st.at)}` : ''}. Повторяю автоматически.`;
      case 'conflict':
        return `⚠ В облаке более новая версия этой партии (ход ${st.turn}). Эта версия больше не сохраняется — выйдите в меню и откройте партию заново.`;
    }
  }

  // ——————————————————— Меню ———————————————————

  private loadSetup(): SetupRow[] {
    try {
      const raw = localStorage.getItem(SETUP_KEY);
      const rows = raw ? (JSON.parse(raw) as SetupRow[]) : null;
      if (rows && rows.length >= 2 && rows.length <= 6) return this.fixTokens(rows);
    } catch {
      /* настройки по умолчанию */
    }
    return this.fixTokens([
      { name: 'Игрок', isBot: false },
      { name: 'Олег', isBot: true },
      { name: 'Марина', isBot: true },
      { name: 'Тимур', isBot: true },
    ]);
  }

  /** У каждого игрока своя фишка: пустые и повторы заменяются свободными. */
  private fixTokens(rows: SetupRow[]): SetupRow[] {
    const used = new Set<string>();
    for (const r of rows) {
      const t = r.token ? normalizeToken(r.token) : '';
      r.token = t && !used.has(t) ? t : '';
      if (r.token) used.add(r.token);
    }
    for (const r of rows) {
      if (!r.token) {
        r.token = PLAYER_TOKENS.find((t) => !used.has(t))!;
        used.add(r.token);
      }
    }
    return rows;
  }

  private renderMenu(): void {
    const rows = this.setup;
    const humans = rows.filter((r) => !r.isBot).length;
    this.root.innerHTML = `
      <div class="menu">
        <div class="logo"><span>МОСКВА</span><b>МАГНАТ</b></div>
        ${this.gamesHtml()}
        <div class="menu-card">
          <div class="menu-title">Игроки</div>
          <div class="setup-list">
            ${rows
              .map(
                (r, i) => `<div class="setup-row" style="--pc:${PLAYER_COLORS[i]}">
                <button class="tok tokpick" data-act="pickToken" data-id="${i}" aria-label="Выбрать фишку">${tokenSvg(r.token ?? PLAYER_TOKENS[i], PLAYER_COLORS[i])}<i>▾</i></button>
                <input data-name="${i}" maxlength="12" value="${esc(r.name)}" />
                <button class="kind ${r.isBot ? 'bot' : 'human'}" data-act="toggleKind" data-id="${i}">${r.isBot ? '🤖 Бот' : '🙂 Человек'}</button>
                <button class="del" data-act="removePlayer" data-id="${i}" ${rows.length <= 2 ? 'disabled' : ''}>✕</button>
              </div>`,
              )
              .join('')}
          </div>
          ${rows.length < 6 ? `<button class="btn ghost" data-act="addPlayer">＋ Добавить игрока</button>` : ''}
          <div class="hint">${
            humans > 1 ? `Людей: ${humans} — ходите по очереди, передавая телефон.` : humans === 0 ? 'Нужен хотя бы один человек.' : ''
          }</div>
          <button class="btn big green" data-act="new" ${humans === 0 ? 'disabled' : ''}>Новая игра</button>
          <button class="btn ghost" data-act="importCode">Загрузить партию по коду</button>
        </div>
        ${this.menuModalHtml()}
        <div class="menu-card" hidden>
        </div>
      </div>`;
  }

  private saveSetup(): void {
    try {
      localStorage.setItem(SETUP_KEY, JSON.stringify(this.setup));
    } catch {
      /* ignore */
    }
  }

  private startNew(): void {
    const rows = this.setup.map((r, i) => ({ ...r, name: r.name.trim().slice(0, 12) || `Игрок ${i + 1}` }));
    if (!rows.some((r) => !r.isBot)) return;
    this.setup = this.fixTokens(rows);
    this.saveSetup();
    // Жеребьёвка: порядок ходов случайный, у каждого свои фишка и цвет.
    const people = rows.map((r, i) => ({ name: r.name, isBot: r.isBot, color: PLAYER_COLORS[i], token: r.token! }));
    for (let i = people.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [people[i], people[j]] = [people[j], people[i]];
    }
    this.startGame(Game.create(people), newGameId());
    this.store.opened(this.gameId!, this.game!.state, 0);
    this.save();
    this.modal = 'order';
    this.render();
  }

  private startGame(game: Game, id: string): void {
    if (this.botTimer !== null) clearTimeout(this.botTimer);
    this.botTimer = null;
    // Прерываем анимации прошлой партии: отпускаем ожидающие окна, сбрасываем «ход идёт».
    this.gen++;
    this.busy = false;
    this.undo = null;
    const pending = [this.noticeResolve, this.modalResolve];
    this.notice = null;
    this.noticeResolve = null;
    this.modalResolve = null;
    pending.forEach((r) => r?.());
    for (const p of game.state.players) p.token = normalizeToken(p.token);
    this.game = game;
    this.gameId = id;
    this.holder = null;
    this.histEntries = null;
    this.shownPos = game.state.players.map((p) => p.position);
    this.shownMoney = game.state.players.map((p) => p.money);
    this.prevCurrent = game.state.current;
    if (game.state.dice) this.diceShown = game.state.dice;
    this.modal = null;
    this.render();
    this.scheduleBot();
  }

  /** Сохраняет текущую партию (браузер — сразу, облако — пакетом). */
  private save(): void {
    if (!this.game || !this.gameId) return;
    this.store.save(this.gameId, this.game.state, this.undo);
  }

  private importHtml(): string {
    return `<h3>Загрузить партию по коду</h3>
      <div class="hint">Вставьте код партии целиком (он начинается с «MM1.»).</div>
      <textarea id="codeIn" class="codebox" placeholder="MM1.…"></textarea>
      <div id="codeErr" class="codeerr"></div>
      <button class="btn green" data-act="importYes">Загрузить</button>
      <button class="btn ghost" data-act="close">Отмена</button>`;
  }

  /** Окна поверх главного меню. */
  private menuModalHtml(): string {
    if (!this.modal) return '';
    let body = '';
    if (this.modal === 'import') body = this.importHtml();
    else if (this.modal.startsWith('token:')) {
      const row = Number(this.modal.slice(6));
      body = `<h3>Фишка для «${esc(this.setup[row]?.name || 'игрока')}»</h3>
        <div class="tokgrid">${PLAYER_TOKENS.map((t) => {
          const owner = this.setup.findIndex((r) => r.token === t);
          const mine = owner === row;
          return `<button class="tokopt ${mine ? 'sel' : ''}" data-act="setToken" data-id="${row}" data-tok="${t}" style="--pc:${PLAYER_COLORS[row]}">
            ${tokenSvg(t, PLAYER_COLORS[row])}<span>${TOKEN_NAMES[t as keyof typeof TOKEN_NAMES]}</span>
            ${owner >= 0 && !mine ? `<i>у «${esc(this.setup[owner].name)}» — поменяетесь</i>` : ''}
          </button>`;
        }).join('')}</div>
        <button class="btn ghost" data-act="close">Отмена</button>`;
    } else if (this.modal.startsWith('hide:')) {
      const gid = this.modal.slice(5);
      body = `<h3>Убрать партию из списка?</h3>
        <div class="msg">Её нельзя будет продолжить.</div>
        <button class="btn red" data-act="hideYes" data-gid="${esc(gid)}">Убрать</button>
        <button class="btn ghost" data-act="close">Отмена</button>`;
    } else return '';
    return `<div class="overlay enter"><div class="modal">${body}</div></div>`;
  }

  private showMenuToast(msg: string): void {
    if (this.game) return this.showToast(msg);
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    this.root.appendChild(el);
    window.setTimeout(() => el.remove(), 2200);
  }

  /** Список сохранённых партий в главном меню. */
  private gamesHtml(): string {
    const list = this.games;
    if (list === null) return `<div class="menu-card"><div class="hint wait">Ищем сохранённые партии…</div></div>`;
    const warn = this.gamesCloudOk
      ? ''
      : `<div class="savestat error">⚠ Облако не ответило — показаны только партии с этого телефона.</div>
         <button class="btn ghost" data-act="refreshGames">Попробовать ещё раз</button>`;
    if (!list.length) return warn ? `<div class="menu-card">${warn}</div>` : '';
    const t = (iso: string) => {
      if (!iso || iso.startsWith('1970')) return '';
      const d = new Date(iso);
      const today = new Date().toDateString() === d.toDateString();
      return today
        ? `сегодня в ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
        : d.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    };
    return `<div class="menu-card">
      <div class="menu-title">Ваши партии</div>
      ${warn}
      ${list
        .map(
          (g) => `<div class="gitem">
            <button class="gmain" data-act="continue" data-gid="${esc(g.id)}">
              <span class="gplayers">${g.players
                .map((p) => `<span class="gp ${p.bankrupt ? 'out' : ''}" style="--pc:${esc(p.color)}">${tokenSvg(p.token, p.color)}${esc(p.name)} <i>${p.money.toLocaleString('ru-RU')}</i></span>`)
                .join('')}</span>
              <span class="gmeta">Ход ${g.turn}${t(g.savedAt) ? ` · ${t(g.savedAt)}` : ''} · ${g.where === 'local' ? '📱 на этом устройстве' : '☁ в облаке'}</span>
            </button>
            <button class="gdel" data-act="hideGame" data-gid="${esc(g.id)}" aria-label="Убрать партию">✕</button>
          </div>`,
        )
        .join('')}
    </div>`;
  }

  // ——————————————————— Действия ———————————————————

  private humanCount(): number {
    return this.game!.state.players.filter((p) => !p.isBot && !p.bankrupt).length;
  }

  /** Человек, от лица которого показан интерфейс (-1, если люди выбыли). */
  private me(): number {
    const game = this.game!;
    const actor = game.actor();
    if (!game.player(actor).isBot) return actor;
    if (this.holder !== null && !game.player(this.holder).bankrupt) return this.holder;
    return game.state.players.findIndex((p) => !p.isBot && !p.bankrupt);
  }

  /** Нужно ли показать экран «передай телефон». */
  private needsHandoff(): boolean {
    const game = this.game!;
    if (game.state.phase === 'gameover' || this.modal === 'order') return false;
    const actor = game.actor();
    if (game.player(actor).isBot || actor === this.holder) return false;
    // Ставки на аукционе — открытая информация: телефон просто передают, без экрана-заставки.
    if (this.humanCount() <= 1 || game.state.phase === 'auction') {
      this.holder = actor;
      return false;
    }
    return true;
  }

  private async act(playerId: number, action: Action): Promise<void> {
    const game = this.game!;
    if (this.busy) return;
    const before = action.type === 'roll' && !game.player(playerId).isBot ? structuredClone(game.state) : null;
    try {
      game.dispatch(playerId, action);
      if (before) this.undo = { state: before, player: playerId };
      if (action.type === 'endTurn' || game.state.phase === 'gameover') this.undo = null;
    } catch (e) {
      if (e instanceof GameError) {
        this.showToast(e.message);
        return;
      }
      throw e;
    }
    this.save();
    this.busy = true;
    this.busyText = '';
    this.render();
    const gen = this.gen;
    await this.play(game.drainEvents(), gen);
    if (gen !== this.gen) return; // за это время открыли другую партию
    this.busy = false;
    this.render();
    this.scheduleBot();
  }

  private sfx(name: SoundName): void {
    this.sound.play(name);
  }

  private vib(ms: number | number[]): void {
    if (this.prefs.vibrate) navigator.vibrate?.(ms);
  }

  private savePrefs(): void {
    this.sound.enabled = this.prefs.sound;
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs));
    } catch {
      /* ignore */
    }
  }

  private rectOf(sel: string): DOMRect | null {
    return this.root.querySelector(sel)?.getBoundingClientRect() ?? null;
  }

  private chipRect(player: number): DOMRect | null {
    return this.rectOf(`[data-chip="${player}"]`);
  }

  /** Деньги: монеты летят от плательщика к получателю (null — банк/центр поля). */
  private async moneyFx(from: number | null, to: number | null, amount: number, toRect?: DOMRect | null): Promise<void> {
    const bank = this.rectOf('.ccard') ?? this.rectOf('.center');
    const a = from !== null ? this.chipRect(from) : bank;
    const b = toRect ?? (to !== null ? this.chipRect(to) : bank);
    const text = amount.toLocaleString('ru-RU');
    if (from !== null) {
      const r = this.chipRect(from);
      if (r) floatText(r, `−${text}`, 'minus');
      void this.tweenMoney(from, this.shownMoney[from] - amount);
    }
    this.sfx(from !== null && to === null ? 'pay' : 'coin');
    const coins = Math.max(3, Math.min(10, Math.round(Math.log10(Math.max(amount, 10)) * 2)));
    if (a && b) await flyCoins(a, b, coins);
    if (to !== null) {
      const r = this.chipRect(to);
      if (r) floatText(r, `+${text}`, 'plus');
      if (from !== null) this.sfx('coin');
      void this.tweenMoney(to, this.shownMoney[to] + amount);
    }
    await sleep(120);
  }

  private tweenMoney(player: number, target: number): Promise<void> {
    const start = this.shownMoney[player];
    this.shownMoney[player] = target;
    return tweenNumber(start, target, 650, (v) => {
      const el = this.root.querySelector(`[data-chip="${player}"] .pm`);
      if (el && !this.game?.player(player).bankrupt) el.textContent = v.toLocaleString('ru-RU');
    });
  }

  private async play(events: GameEvent[], gen: number): Promise<void> {
    const game = this.game!;
    for (let i = 0; i < events.length; i++) {
      if (gen !== this.gen) return;
      const e = events[i];
      const next = events[i + 1];
      switch (e.kind) {
        case 'dice':
          await this.animateDice(e.dice);
          break;
        case 'move':
          await this.animateMove(e.player, e.to, e.direct);
          break;
        case 'card':
          this.sfx('card');
          this.modal = 'card';
          this.render();
          await this.waitModalClosed();
          break;
        case 'notice':
          this.busyText = 'Смотрите, что произошло';
          await this.showNotice(e);
          break;
        case 'money':
          if (e.delta < 0 && next?.kind === 'buy' && next.player === e.player && (next.auction || game.player(e.player).isBot)) {
            const cell = BOARD[next.cell];
            await this.showNotice({
              kind: 'notice',
              tone: 'info',
              title: next.auction ? 'Аукцион' : 'Покупка',
              text: `${game.player(e.player).name} покупает «${cell.name}»`,
              amount: next.price,
              from: e.player,
              to: null,
            });
          }
          if (e.delta < 0 && next?.kind === 'money' && next.delta === -e.delta && next.player !== e.player) {
            await this.moneyFx(e.player, next.player, -e.delta);
            i++;
          } else if (e.delta < 0 && next?.kind === 'buy' && next.player === e.player) {
            await this.moneyFx(e.player, null, -e.delta, this.rectOf(`[data-cell="${next.cell}"]`));
          } else if (e.delta < 0) {
            await this.moneyFx(e.player, null, -e.delta);
          } else {
            await this.moneyFx(null, e.player, e.delta);
          }
          break;
        case 'buy': {
          this.sfx('buy');
          this.vib([15, 40, 15]);
          this.render();
          const cell = this.root.querySelector(`[data-cell="${e.cell}"]`);
          const r = cell?.getBoundingClientRect();
          if (r) confetti(r, [game.player(e.player).color, '#ffd84d', '#5d52ec', '#ffffff'], 22, 0.8);
          cell?.animate(
            [{ transform: 'scale(1)' }, { transform: 'scale(1.25)', zIndex: 3, offset: 0.4 }, { transform: 'scale(1)' }],
            { duration: 450, easing: 'ease-out' },
          );
          await sleep(350);
          break;
        }
        case 'build': {
          this.sfx('build');
          this.vib(20);
          this.render();
          this.root
            .querySelector(`[data-cell="${e.cell}"] .strip`)
            ?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 350 });
          break;
        }
        case 'jail':
          this.sfx('jail');
          this.vib([60, 40, 60]);
          shake(this.root.querySelector('.board'), 7);
          await sleep(400);
          await this.showNotice({ kind: 'notice', tone: 'bad', title: 'Тюрьма', text: `${game.player(e.player).name} отправляется в тюрьму`, cell: 10 });
          break;
        case 'bankrupt':
          this.sfx('lose');
          shake(this.root.querySelector(`[data-chip="${e.player}"]`), 8);
          await this.showNotice({ kind: 'notice', tone: 'bad', title: 'Банкротство', text: `${game.player(e.player).name} выбывает из игры` });
          break;
        case 'trade': {
          const o = e.offer;
          this.sfx(e.accepted ? 'deal' : 'click');
          const names = (cells: number[], money: number) =>
            [...cells.map((id) => BOARD[id].short ?? BOARD[id].name), money ? formatMoney(money) : ''].filter(Boolean).join(', ') || 'ничего';
          if (e.accepted) {
            await this.showNotice({
              kind: 'notice',
              tone: 'info',
              title: 'Сделка',
              text: `${game.player(o.from).name} отдаёт: ${names(o.giveCells, o.giveMoney)}. ${game.player(o.to).name} отдаёт: ${names(o.getCells, o.getMoney)}.`,
              from: o.from,
              to: o.to,
            });
          } else {
            await this.showNotice({
              kind: 'notice',
              tone: 'bad',
              title: 'Обмен отклонён',
              text: `${game.player(o.to).name} отказывается от сделки`,
              from: o.to,
              to: o.from,
            });
          }
          break;
        }
        case 'gameover': {
          const w = e.winner !== null ? game.player(e.winner) : null;
          this.sfx(w && !w.isBot ? 'win' : 'lose');
          this.render();
          const r = this.rectOf('.center');
          if (r) {
            const colors = ['#ffd84d', '#5d52ec', '#ff5a7a', '#2ecc71', '#5ec8f2'];
            confetti(r, colors, 60, 1.6);
            window.setTimeout(() => confetti(r, colors, 40, 1.3), 400);
          }
          break;
        }
        default:
          break;
      }
    }
    // Страховка: показываем точные суммы после всех эффектов.
    game.state.players.forEach((p, i) => {
      if (this.shownMoney[i] !== p.money) void this.tweenMoney(i, p.money);
    });
  }

  private async animateDice(dice: [number, number]): Promise<void> {
    this.sfx('dice');
    this.vib(25);
    this.rolling = true;
    for (let i = 0; i < 8; i++) {
      this.diceShown = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
      this.render();
      await sleep(65);
    }
    this.rolling = false;
    this.diceShown = dice;
    this.render();
    this.root.querySelectorAll('.die').forEach((d, i) =>
      d.animate(
        [
          { transform: 'translateY(-18px) rotate(-14deg) scale(1.1)' },
          { transform: 'translateY(0) scale(1.12, .88)', offset: 0.6 },
          { transform: 'none' },
        ],
        { duration: 320, delay: i * 40, easing: 'ease-out' },
      ),
    );
    if (dice[0] === dice[1]) {
      this.sfx('double');
      const r = this.rectOf('.dice');
      if (r) confetti(r, ['#ffd84d', '#ffffff', '#5d52ec'], 14, 0.6);
    }
    await sleep(420);
  }

  private async animateMove(player: number, to: number, direct: boolean): Promise<void> {
    if (direct) {
      this.busyText = 'Фишка в пути…';
      this.hopMs = 520;
      this.shownPos[player] = to;
      this.render();
      this.hopMs = STEP_MS;
      await sleep(560);
      return;
    }
    const from = this.shownPos[player];
    const forward = (to - from + 40) % 40;
    const backward = (from - to + 40) % 40;
    const dir = forward <= 12 || forward <= backward ? 1 : -1;
    let pos = from;
    this.busyText = 'Фишка в пути…';
    const gen = this.gen;
    while (pos !== to) {
      if (gen !== this.gen) return;
      pos = (pos + dir + 40) % 40;
      this.shownPos[player] = pos;
      this.render();
      this.sfx('step');
      this.vib(8);
      await sleep(STEP_MS);
    }
    this.sfx('land');
    await sleep(160);
  }

  private modalResolve: (() => void) | null = null;
  private waitModalClosed(): Promise<void> {
    return new Promise((r) => (this.modalResolve = r));
  }

  private closeModal(): void {
    this.modal = null;
    const r = this.modalResolve;
    this.modalResolve = null;
    if (this.game) this.render();
    else this.renderMenu();
    r?.();
  }

  private scheduleBot(): void {
    const game = this.game;
    if (!game || this.botTimer !== null || game.state.phase === 'gameover') return;
    const actor = game.actor();
    if (!game.player(actor).isBot) return;
    const delay = game.state.phase === 'auction' ? 350 : BOT_DELAY;
    this.botTimer = window.setTimeout(async () => {
      this.botTimer = null;
      if (this.busy || this.modal === 'card' || this.modal === 'order') return this.scheduleBot();
      const a = botDecide(game, actor);
      if (a) await this.act(actor, a);
    }, delay);
  }

  private showToast(msg: string): void {
    this.toast = msg;
    this.render();
    window.setTimeout(() => {
      if (this.toast === msg) {
        this.toast = null;
        this.render();
      }
    }, 1800);
  }

  private onClick(e: Event): void {
    this.sound.unlock();
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act],[data-cell],[data-bid],[data-tcell],[data-money]');
    if (t && t.matches('.btn, .nav button, .hbtn, .seg button, .kind, .partner, .tcell, .tmoney button, [data-cell]')) {
      const a = t.dataset.act;
      if (a !== 'roll') this.sfx('click');
    }
    if (!t) {
      const el = e.target as HTMLElement;
      if (el.classList.contains('overlay') && !el.classList.contains('locked') && !el.classList.contains('sticky')) this.closeModal();
      return;
    }
    const game = this.game;
    const me = game ? this.me() : -1;
    const d = this.draft;
    if (t.dataset.tcell && d) {
      const id = Number(t.dataset.tcell);
      const list = game!.state.cells[id].owner === d.from ? d.give : d.get;
      const i = list.indexOf(id);
      if (i >= 0) list.splice(i, 1);
      else list.push(id);
      return this.render();
    }
    if (t.dataset.money && d) {
      const [side, delta] = t.dataset.money.split(':');
      const key = side === 'give' ? 'giveMoney' : 'getMoney';
      const max = game!.player(side === 'give' ? d.from : d.to).money;
      d[key] = Math.max(0, Math.min(max, d[key] + Number(delta)));
      return this.render();
    }
    if (t.dataset.cell) {
      this.returnToAssets = this.modal === 'assets';
      this.modal = `cell:${t.dataset.cell}`;
      this.render();
      return;
    }
    if (t.dataset.bid && game?.state.auction) {
      void this.act(me, { type: 'bid', amount: game.state.auction.bid + Number(t.dataset.bid) });
      return;
    }
    const act = t.dataset.act!;
    const cell = Number(t.dataset.id);
    switch (act) {
      case 'new':
        return this.startNew();
      case 'pickToken':
        this.modal = `token:${cell}`;
        return this.renderMenu();
      case 'setToken': {
        const tok = t.dataset.tok!;
        const other = this.setup.findIndex((r) => r.token === tok);
        if (other >= 0 && other !== cell) this.setup[other].token = this.setup[cell].token;
        this.setup[cell].token = tok;
        this.saveSetup();
        this.modal = null;
        return this.renderMenu();
      }
      case 'toggleKind':
        this.setup[cell].isBot = !this.setup[cell].isBot;
        this.saveSetup();
        return this.renderMenu();
      case 'removePlayer':
        if (this.setup.length > 2) this.setup.splice(cell, 1);
        this.saveSetup();
        return this.renderMenu();
      case 'addPlayer': {
        const botNames = ['Олег', 'Марина', 'Тимур', 'Вика', 'Артём', 'Соня'];
        const used = new Set(this.setup.map((r) => r.name));
        const name = botNames.find((n) => !used.has(n)) ?? `Игрок ${this.setup.length + 1}`;
        if (this.setup.length < 6) this.setup.push({ name, isBot: true });
        this.fixTokens(this.setup);
        this.saveSetup();
        return this.renderMenu();
      }
      case 'ready':
        this.holder = game!.actor();
        return this.render();
      case 'trade':
        if (!game || (game.state.phase !== 'roll' && game.state.phase !== 'end') || game.player(game.actor()).isBot) {
          return this.showToast('Сделку можно предложить в начале или в конце своего хода');
        }
        this.draft = { from: me, to: -1, give: [], get: [], giveMoney: 0, getMoney: 0 };
        this.modal = 'trade';
        return this.render();
      case 'tradeTo':
        if (d) {
          d.to = cell;
          d.get = [];
          d.getMoney = 0;
        }
        return this.render();
      case 'transferSend': {
        if (!d || d.to < 0 || !game) return;
        const action: Action = { type: 'transfer', to: d.to, amount: d.giveMoney };
        if (!game.can(me, action)) {
          try {
            game.dispatch(me, action);
          } catch (err) {
            if (err instanceof GameError) this.showToast(err.message);
          }
          return;
        }
        this.draft = null;
        this.modal = null;
        void this.act(me, action);
        return;
      }
      case 'tradeSend': {
        if (!d || d.to < 0) return;
        const offer = { to: d.to, giveCells: d.give, getCells: d.get, giveMoney: d.giveMoney, getMoney: d.getMoney };
        if (!game!.can(me, { type: 'proposeTrade', offer })) {
          try {
            game!.dispatch(me, { type: 'proposeTrade', offer });
          } catch (err) {
            if (err instanceof GameError) this.showToast(err.message);
          }
          return;
        }
        this.draft = null;
        this.modal = null;
        void this.act(me, { type: 'proposeTrade', offer });
        return;
      }
      case 'continue': {
        const gid = t.dataset.gid!;
        this.showMenuToast('Открываем партию…');
        void this.store.load(gid).then((r) => {
          if (!r) return this.showMenuToast('Не удалось открыть партию. Проверьте интернет и попробуйте ещё раз.');
          this.store.opened(gid, r.state, r.rev);
          this.startGame(new Game(r.state), gid);
          this.undo = r.undo;
          this.render();
          if (r.cloudUnchecked) this.showToast('⚠ Облако не ответило — открыта версия с этого телефона');
        });
        return;
      }
      case 'refreshGames':
        this.games = null;
        this.renderMenu();
        void this.refreshGames();
        return;
      case 'hideGame':
        this.modal = `hide:${t.dataset.gid}`;
        return this.renderMenu();
      case 'hideYes': {
        const gid = t.dataset.gid!;
        this.modal = null;
        this.store.hide(gid);
        this.games = (this.games ?? []).filter((g) => g.id !== gid);
        this.renderMenu();
        return;
      }
      case 'importCode':
        this.modal = 'import';
        return this.game ? this.render() : this.renderMenu();
      case 'importYes': {
        const area = this.root.querySelector<HTMLTextAreaElement>('#codeIn');
        const st = area ? importCode(area.value) : null;
        if (!st) {
          const err = this.root.querySelector('#codeErr');
          if (err) err.textContent = 'Код не подошёл. Скопируйте его целиком, начиная с «MM1.»';
          return;
        }
        this.modal = null;
        const id = importId(area!.value);
        this.store.adopt(id, st);
        this.startGame(new Game(st), id);
        this.save();
        this.showToast('Партия загружена из кода');
        return;
      }
      case 'copyCode': {
        if (!this.game) return;
        const code = exportCode(this.game.state);
        const box = this.root.querySelector<HTMLTextAreaElement>('#codeOut');
        if (box) box.value = code;
        navigator.clipboard?.writeText(code).then(
          () => this.showToast('Код партии скопирован'),
          () => {
            box?.focus();
            box?.select();
            this.showToast('Выделите код и скопируйте вручную');
          },
        );
        return;
      }
      case 'menu':
        if (this.botTimer !== null) clearTimeout(this.botTimer);
        this.botTimer = null;
        this.save();
        this.store.flush();
        this.gen++;
        this.busy = false;
        {
          const pending = [this.noticeResolve, this.modalResolve];
          this.noticeResolve = null;
          this.modalResolve = null;
          this.notice = null;
          pending.forEach((r) => r?.());
        }
        this.game = null;
        this.gameId = null;
        this.modal = null;
        this.renderMenu();
        void this.refreshGames();
        return;
      case 'close':
        this.draft = null;
        if (this.returnToAssets && this.modal?.startsWith('cell:')) {
          this.returnToAssets = false;
          this.modal = 'assets';
          return this.render();
        }
        this.returnToAssets = false;
        return this.closeModal();
      case 'settings':
        this.modal = 'settings';
        return this.render();
      case 'showCode':
        this.modal = 'code';
        return this.render();
      case 'toggleUnlimited': {
        if (!this.game) return;
        const st = this.game.state;
        st.rules = { ...st.rules, unlimitedHouses: !st.rules?.unlimitedHouses };
        if (!st.rules.unlimitedHouses) {
          // Лимит вернулся — пересчитываем запас банка по тому, что стоит на поле.
          const houses = st.cells.reduce((n, c) => n + (c.houses < 5 ? c.houses : 0), 0);
          const hotels = st.cells.filter((c) => c.houses === 5).length;
          st.housesLeft = Math.max(0, MAX_HOUSES - houses);
          st.hotelsLeft = Math.max(0, MAX_HOTELS - hotels);
        }
        st.log.push(st.rules.unlimitedHouses ? 'Включено правило: дома без лимита.' : 'Выключено правило: дома без лимита.');
        this.save();
        this.render();
        this.showToast(st.rules.unlimitedHouses ? '🏠 Дома без лимита — можно строить' : 'Лимит домов в банке снова действует');
        return;
      }
      case 'toggleEdit':
        this.editOwners = !this.editOwners;
        return this.render();
      case 'history':
        this.modal = 'history';
        if (!this.histEntries || this.modal === 'history') void this.loadHistory();
        return this.render();
      case 'rollback':
        this.modal = `rollback:${cell}`;
        return this.render();
      case 'rollbackYes': {
        const e = this.histEntries?.[cell];
        if (!e) return;
        this.modal = null;
        const keep = this.gameId ?? newGameId();
        const st = structuredClone(e.state);
        this.store.opened(keep, st, this.store.revOf(keep));
        this.startGame(new Game(st), keep);
        this.save();
        this.showToast(`Партия возвращена к ходу ${e.state.turnNumber}`);
        return;
      }
      case 'setOwner': {
        if (!game) return;
        const ownerRaw = t.dataset.owner!;
        this.setOwner(cell, ownerRaw === 'bank' ? null : Number(ownerRaw));
        return;
      }
      case 'dismissNotice':
        return this.dismissNotice();
      case 'toggleSound':
        this.prefs.sound = !this.prefs.sound;
        this.savePrefs();
        this.sound.unlock();
        this.sfx('coin');
        return this.render();
      case 'toggleVibro':
        this.prefs.vibrate = !this.prefs.vibrate;
        this.savePrefs();
        this.vib(30);
        return this.render();
      case 'assets':
        this.modal = 'assets';
        return this.render();
      case 'log':
        this.modal = 'log';
        return this.render();
      case 'roll':
      case 'buy':
      case 'decline':
      case 'pass':
      case 'endTurn':

      case 'useJailCard':
      case 'payDebt':
      case 'acceptTrade':
      case 'rejectTrade':
        void this.act(me, { type: act } as Action);
        return;
      case 'undoRoll': {
        const u = this.undo;
        if (!u || !this.game || !this.gameId || this.busy) return;
        const st = structuredClone(u.state);
        st.rngState = randomSeed(); // новый бросок, а не повтор того же
        st.log.push(`${st.players[u.player].name} отменяет бросок и бросает заново.`);
        const holder = this.holder;
        this.store.opened(this.gameId, st, this.store.revOf(this.gameId));
        this.startGame(new Game(st), this.gameId);
        this.holder = holder;
        this.save();
        this.render();
        this.showToast('↩ Ход возвращён — бросайте заново');
        return;
      }
      case 'payJail':
        this.modal = 'payJailConfirm';
        return this.render();
      case 'payJailYes':
        this.modal = null;
        void this.act(me, { type: 'payJail' });
        return;
      case 'bankrupt':
        this.modal = 'bankrupt';
        return this.render();
      case 'bankruptYes':
        this.modal = null;
        void this.act(me, { type: 'bankrupt' });
        return;
      case 'build':
      case 'sellHouse':
      case 'mortgage':
      case 'unmortgage':
        void this.act(me, { type: act, cell } as Action);
        return;
    }
  }

  /** Клавиатура (компьютер): пробел/Enter — главная кнопка, Esc — закрыть окно. */
  private onKey(e: KeyboardEvent): void {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const el = document.activeElement as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
    const q = (sel: string) => this.root.querySelector<HTMLElement>(sel);
    if (e.key === 'Escape') {
      const close = q('.overlay:not(.locked):not(.sticky) [data-act=close]');
      if (close) {
        e.preventDefault();
        close.click();
      }
      return;
    }
    if (e.key !== ' ' && e.key !== 'Enter') return;
    if (e.repeat) return;
    const overlay = q('.overlay');
    const target =
      q('[data-act=ready]') ??
      (overlay ? null : q('[data-act=dismissNotice]')) ??
      (this.modal === 'card' ? q('.modal [data-act=close]') : null) ??
      (overlay ? null : q('.btns .btn.green:not(:disabled)'));
    if (target) {
      e.preventDefault();
      target.click();
    }
  }

  // ——————————————————— Отрисовка ———————————————————

  private render(): void {
    const game = this.game;
    if (!game) return;
    const s = game.state;
    const sum = s.dice ? s.dice[0] + s.dice[1] : null;
    // Запоминаем, где были фишки, чтобы анимировать перелёт (FLIP).
    const prev = new Map<string, DOMRect>();
    this.root.querySelectorAll<HTMLElement>('[data-tok]').forEach((el) => prev.set(el.dataset.tok!, el.getBoundingClientRect()));
    const scrolls = this.saveScrolls();
    const handoff = this.needsHandoff();
    const modalKey = handoff ? `handoff:${game.actor()}` : this.modal;
    const modalEnter = modalKey !== this.prevModalKey;
    this.prevModalKey = modalKey;
    const turnChanged = s.current !== this.prevCurrent;
    if (turnChanged) {
      this.prevCurrent = s.current;
      if (!game.player(s.current).isBot) this.sfx('turn');
    }
    this.root.innerHTML = `
      <div class="game">
        <header class="hdr">
          <button class="hbtn" data-act="settings" aria-label="Меню">${UI_ICONS.menu}</button>
          <div class="logo hdr-logo"><span>МОСКВА</span><b>МАГНАТ</b></div>
          <button class="hbtn" data-act="toggleSound" aria-label="Звук">${this.prefs.sound ? UI_ICONS.soundOn : UI_ICONS.soundOff}</button>
        </header>
        <div class="players ${s.players.length > 4 ? 'many' : ''}">${s.players.map((p) => this.playerChip(p.id)).join('')}</div>
        <div class="board-wrap"><div class="board">${BOARD.map((c) => this.cellHtml(c.id)).join('')}
          <div class="center">
            ${MAP_SVG}
            <div class="center-inner">
              ${this.centerCard()}
              <div class="dice ${this.rolling ? 'rolling' : ''}">
                <div class="die">${pips(this.diceShown[0])}</div><div class="die">${pips(this.diceShown[1])}</div>
              </div>
              ${this.noticeHtml()}
              <div class="dice-sum ${sum && !this.rolling ? '' : 'empty'}">${sum && !this.rolling ? `Выпало ${sum}${s.dice![0] === s.dice![1] ? ' · дубль!' : ''}` : '&nbsp;'}</div>
            </div>
          </div>
        </div></div>
        <div class="action">${this.panelHtml()}</div>
        ${this.myCardsHtml()}
        <nav class="nav">
          <button data-act="assets">${UI_ICONS.home}<span>Имущество</span></button>
          <button data-act="trade">${UI_ICONS.deal}<span>Сделки</span></button>
          <button data-act="log">${UI_ICONS.list}<span>История</span></button>
        </nav>
        ${handoff ? this.handoffHtml() : this.modalHtml()}
        ${this.toast ? `<div class="toast">${esc(this.toast)}</div>` : ''}
      </div>`;
    if (modalEnter) this.root.querySelector('.overlay')?.classList.add('enter');
    else this.restoreScrolls(scrolls);
    const hl = `${this.highlighted()}:${s.phase}`;
    if (hl !== this.prevHighlight) {
      this.prevHighlight = hl;
      this.root.querySelector('.chip.active')?.classList.add('enter');
    }
    this.root.querySelectorAll<HTMLElement>('[data-tok]').forEach((el) => {
      const a = prev.get(el.dataset.tok!);
      if (!a) return;
      const b = el.getBoundingClientRect();
      const dx = a.left - b.left;
      const dy = a.top - b.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      const lift = Math.min(46, 16 + Math.hypot(dx, dy) * 0.2);
      el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px)` },
          { transform: `translate(${dx / 2}px, ${dy / 2 - lift}px) scale(1.15)`, offset: 0.5 },
          { transform: 'translate(0, 0) scale(1.2, 0.8)', offset: 0.82 },
          { transform: 'none' },
        ],
        { duration: this.hopMs, easing: 'ease-in-out' },
      );
    });
  }

  private static SCROLLERS = ['.modal', '.tlist', '.hlist', '.log', '.mycards'];

  private saveScrolls(): Map<string, number[]> {
    const m = new Map<string, number[]>();
    for (const sel of App.SCROLLERS) {
      m.set(sel, [...this.root.querySelectorAll<HTMLElement>(sel)].map((el) => (sel === '.mycards' ? el.scrollLeft : el.scrollTop)));
    }
    return m;
  }

  private restoreScrolls(m: Map<string, number[]>): void {
    for (const [sel, vals] of m) {
      this.root.querySelectorAll<HTMLElement>(sel).forEach((el, i) => {
        if (vals[i] === undefined) return;
        if (sel === '.mycards') el.scrollLeft = vals[i];
        else el.scrollTop = vals[i];
      });
    }
  }

  private playerChip(id: number): string {
    const game = this.game!;
    const p = game.player(id);
    const s = game.state;
    const active = this.highlighted() === id;
    const mine = active && !p.isBot && this.humanCount() <= 1;
    const label = s.phase === 'auction' ? 'СТАВИТ' : s.phase === 'trade' ? 'ОБМЕН' : s.phase === 'debt' ? 'ДОЛГ' : 'ХОД';
    const lead = s.phase === 'auction' && s.auction?.bidder === id ? `<span class="bidtag">ставка ${s.auction.bid.toLocaleString('ru-RU')}</span>` : '';
    return `<div class="chip ${active ? 'active' : ''} ${p.bankrupt ? 'out' : ''} ${lead ? 'leader' : ''}" data-chip="${id}" style="--pc:${p.color}">
      ${active ? `<span class="badge">${mine ? `ВЫ · ${label}` : label}</span>` : ''}${lead}
      <div class="chip-top"><span class="tok">${tk(p)}</span><span class="pn">${esc(p.name)}${p.inJail ? ' 🔒' : ''}</span></div>
      <span class="pm">${p.bankrupt ? 'банкрот' : (this.shownMoney[id] ?? p.money).toLocaleString('ru-RU')}</span>
    </div>`;
  }

  private cellHtml(id: number): string {
    const game = this.game!;
    const c = BOARD[id];
    const own = game.state.cells[id];
    const { row, col, side } = gridPos(id);
    const owner = own.owner !== null ? game.player(own.owner) : null;
    const here = game.state.players.filter((p) => !p.bankrupt && this.shownPos[p.id] === id);
    const tokens = here
      .map((p) => `<span class="token ${p.id === game.state.current ? 'cur' : ''}" data-tok="${p.id}" style="--pc:${p.color}">${tk(p)}</span>`)
      .join('');
    const houses =
      own.houses === 5 ? '<span class="hotel"></span>' : '<span class="house"></span>'.repeat(own.houses);
    const label = CELL_LABELS[id] ?? c.short ?? c.name;
    return `<div class="cell ${side} t-${c.type} ${own.mortgaged ? 'mortgaged' : ''}" data-cell="${id}"
        style="grid-row:${row};grid-column:${col};${owner ? `--oc:${owner.color}` : ''}">
      ${c.group ? `<div class="strip" style="background:${GROUP_COLORS[c.group]}">${houses}</div>` : ''}
      <div class="cbody">
        ${c.type === 'property' ? '' : `<div class="cicon">${cellIcon(id)}</div>`}
        ${c.type === 'property' || side === 'corner' ? `<div class="cname">${esc(label)}</div>` : ''}
        ${c.price ? `<div class="cprice">${c.price.toLocaleString('ru-RU')}</div>` : ''}
      </div>
      ${owner ? '<div class="owner-mark"></div>' : ''}
      <div class="tokens n${Math.min(here.length, 6)}">${tokens}</div>
    </div>`;
  }

  /** Кого подсвечивать в панели игроков: того, от кого сейчас ждут действия. */
  private highlighted(): number {
    const s = this.game!.state;
    if (s.phase === 'gameover') return -1;
    return s.phase === 'auction' || s.phase === 'trade' || s.phase === 'debt' ? this.game!.actor() : s.current;
  }

  /** Показывает окно-событие и ждёт, пока игрок нажмёт «OK». */
  private showNotice(n: Notice): Promise<void> {
    this.notice = { ...n, id: ++this.noticeSeq, at: performance.now() };
    this.sfx(n.tone === 'bad' ? 'lose' : n.tone === 'gain' ? 'turn' : 'click');
    this.render();
    return new Promise((r) => (this.noticeResolve = r));
  }

  private dismissNotice(): void {
    this.notice = null;
    const r = this.noticeResolve;
    this.noticeResolve = null;
    this.render();
    r?.();
  }

  private noticeHtml(): string {
    const n = this.notice;
    if (!n || !this.game) return '';
    const enter = n.id !== this.prevNoticeId;
    this.prevNoticeId = n.id;
    const game = this.game;
    const who = (id: number | null | undefined) =>
      id === undefined
        ? ''
        : id === null
          ? `<span class="nwho bank">${UI_ICONS.bank}<b>Банк</b></span>`
          : `<span class="nwho">${tk(game.player(id))}<b>${esc(game.player(id).name)}</b></span>`;
    const flow =
      n.from !== undefined || n.to !== undefined
        ? `<div class="nflow">${who(n.from)}${n.from !== undefined && n.to !== undefined ? '<i>→</i>' : ''}${who(n.to)}</div>`
        : '';
    const cell = n.amount && n.cell !== undefined && isOwnable(BOARD[n.cell]) ? `<div class="ncell">за «${esc(BOARD[n.cell].name)}»</div>` : '';
    return `<div class="notice tone-${n.tone} ${enter ? 'enter' : ''}">
      <span class="npill">${esc(n.title)}</span>
      ${flow}
      <div class="ntext">${esc(n.text)}</div>
      ${n.amount ? `<div class="namount">${formatMoney(n.amount)}</div>` : ''}
      ${cell}
      <button class="btn green nok" data-act="dismissNotice">OK</button>
    </div>`;
  }

  /** Лента карточек улиц игрока внизу экрана. */
  private myCardsHtml(): string {
    const game = this.game!;
    const me = this.me();
    if (me < 0) return '';
    const p = game.player(me);
    const owned = game.ownedBy(me);
    if (!owned.length) {
      return `<div class="mycards empty"><span>${tk(p)} ${esc(p.name)}: улиц пока нет</span></div>`;
    }
    return `<div class="mycards" style="--pc:${p.color}">${owned
      .map((id) => {
        const c = BOARD[id];
        const own = game.state.cells[id];
        const mono = c.group ? game.ownsGroup(me, c.group) : false;
        const color = c.group ? GROUP_COLORS[c.group] : '#9b97c4';
        const houses = own.houses === 5 ? '<i class="hotel"></i>' : '<i class="house"></i>'.repeat(own.houses);
        const label = c.short ?? c.name;
        return `<button class="mcard ${own.mortgaged ? 'mortgaged' : ''} ${mono ? 'mono' : ''}" data-cell="${id}" style="--gc:${color}">
          <span class="mbar"></span>
          ${mono ? '<span class="mstar">★</span>' : ''}
          ${c.type === 'property' ? '' : `<span class="mico">${cellIcon(id)}</span>`}
          <span class="mname">${esc(label)}</span>
          ${houses ? `<span class="mhouses">${houses}</span>` : ''}
          <span class="mprice">${own.mortgaged ? 'залог' : `${game.rentFor(id, 7).toLocaleString('ru-RU')} ₽`}</span>
        </button>`;
      })
      .join('')}</div>`;
  }

  /** Большая карточка клетки, на которой стоит текущий игрок. */
  private centerCard(): string {
    const game = this.game!;
    const s = game.state;
    const id = s.phase === 'auction' && s.auction ? s.auction.cell : this.shownPos[s.current];
    const c = BOARD[id];
    const own = s.cells[id];
    const owner = own.owner !== null ? game.player(own.owner) : null;
    let pill = TYPE_LABEL[c.type];
    let pillStyle = '';
    if (s.phase === 'auction' && s.auction && s.auction.cell === id) {
      const a = s.auction;
      pill = a.bidder !== null ? `АУКЦИОН · ${formatMoney(a.bid)} · ${game.player(a.bidder).name.toUpperCase()}` : 'АУКЦИОН · СТАВОК НЕТ';
      pillStyle = a.bidder !== null ? `style="--pc:${game.player(a.bidder).color}" data-owned` : '';
    } else if (isOwnable(c)) {
      if (owner) {
        pill = `${own.mortgaged ? 'В ЗАЛОГЕ · ' : ''}${owner.name.toUpperCase()}`;
        pillStyle = `style="--pc:${owner.color}" data-owned`;
      } else pill = 'СВОБОДНО';
    }
    const sub =
      c.type === 'property' ? `Улица · ${GROUP_NAMES[c.group!]} группа` : CELL_SUBTITLE[c.type] ?? '';
    let foot = CELL_FOOT[c.type] ?? '';
    if (c.type === 'property') {
      foot = owner
        ? `Аренда сейчас: ${formatMoney(game.rentFor(id, 7))}`
        : `Аренда ${formatMoney(c.rent![0])}, с отелем — ${formatMoney(c.rent![5])}`;
    } else if (c.type === 'start') foot = `+${formatMoney(START_BONUS)} за каждый проход`;
    const amount = c.price ?? c.amount;
    const enter = id !== this.prevCardId;
    this.prevCardId = id;
    return `<div class="ccard ${enter ? 'enter' : ''}" data-cell="${id}" style="--gc:${c.group ? GROUP_COLORS[c.group] : '#7c6cf0'}">
      <div class="ccard-bar"></div>
      <span class="cpill" ${pillStyle}>${esc(pill)}</span>
      <div class="ccard-name">${esc(c.name)}</div>
      <div class="ccard-sub">${esc(sub)}</div>
      <div class="ccard-ill">${cellIcon(id)}</div>
      ${amount ? `<div class="ccard-price">${formatMoney(amount)}</div>` : ''}
      <div class="ccard-foot">${esc(foot)}</div>
    </div>`;
  }

  /** Кнопка «Перебросить» — если текущий игрок уже бросал в этом ходу. */
  private undoBtn(): string {
    const s = this.game!.state;
    if (!this.undo || this.busy || this.undo.player !== s.current || this.game!.actor() !== this.me()) return '';
    return `<button class="btn ghost undo" data-act="undoRoll">↩ Перебросить</button>`;
  }

  private bar(p: { token: string; color: string } | null, title: string, sub: string, btns: string, wait = false): string {
    return `<div class="who">${p ? `<div class="pedestal" style="--pc:${p.color}">${tk(p)}</div>` : ''}</div>
      <div class="info"><div class="atitle">${title}</div><div class="asub ${wait ? 'wait' : ''}">${sub}</div></div>
      <div class="btns">${btns}${btns ? '<div class="keyhint">Пробел — главная кнопка · Esc — закрыть окно</div>' : ''}</div>`;
  }

  private panelHtml(): string {
    const game = this.game!;
    const s = game.state;
    const me = this.me();
    const actor = game.actor();
    const last = esc(s.log[s.log.length - 1] ?? '');
    if (this.busy) {
      const cur = game.player(s.current);
      return this.bar(cur, `Ход: ${esc(cur.name)}`, this.rolling ? 'Бросаем кубики…' : this.busyText || '…', '', true);
    }

    if (s.phase === 'gameover') {
      const w = s.winner !== null ? game.player(s.winner) : null;
      return this.bar(w, w ? `🏆 ${esc(w.name)} побеждает!` : 'Игра окончена', 'Партия завершена', `<button class="btn green" data-act="menu">В меню</button>`);
    }
    const p = game.player(Math.max(0, me));
    if (me < 0) {
      return this.bar(null, 'Все люди выбыли', 'Боты доигрывают партию…', `<button class="btn yellow" data-act="menu">В меню</button>`);
    }
    if (s.phase === 'auction' && s.auction) {
      const a = s.auction;
      const cell = BOARD[a.cell];
      const leader = a.bidder !== null ? esc(game.player(a.bidder).name) : 'нет';
      const title = actor === me ? `Ваша ставка, ${esc(p.name)}` : `Аукцион: ${esc(cell.short ?? cell.name)}`;
      const sub = `Ставка <b>${formatMoney(a.bid)}</b> · лидер: <b>${leader}</b>${actor === me ? `<br>«${esc(cell.short ?? cell.name)}», цена ${formatMoney(cell.price!)}` : ''}`;
      if (actor !== me) return this.bar(game.player(actor), title, `${sub}<br>${esc(game.player(actor).name)} думает…`, '', true);
      return this.bar(
        p,
        title,
        sub,
        `<div class="bid-grid">${[10, 100, 500]
          .map((d) => `<button class="btn green sm" data-bid="${d}" ${a.bid + d > p.money ? 'disabled' : ''}>+${d}</button>`)
          .join('')}<button class="btn yellow sm" data-act="pass">Пас</button></div>`,
      );
    }
    if (s.phase === 'trade' && s.trade) {
      const o = s.trade;
      if (o.to !== me) return this.bar(game.player(o.to), `${esc(game.player(o.to).name)} думает`, 'Рассматривает предложение обмена…', '', true);
      return this.bar(
        game.player(o.from),
        `Обмен от ${esc(game.player(o.from).name)}`,
        'Посмотрите предложение и примите решение.',
        '',
      );
    }
    if (actor !== me) {
      return this.bar(game.player(actor), `Ходит ${esc(game.player(actor).name)}`, last, '', true);
    }

    const title = `Ваш ход, ${esc(p.name)}`;
    switch (s.phase) {
      case 'roll':
        if (p.inJail) {
          return this.bar(
            p,
            title,
            `Вы в тюрьме — попытка ${p.jailTurns + 1} из 3. Выбросите дубль или заплатите штраф.`,
            `<button class="btn green" data-act="roll">Бросить на дубль</button>
             ${p.jailFreeCards.length ? `<button class="btn yellow" data-act="useJailCard">Карточка «Выйти»</button>` : ''}
             <button class="btn yellow" data-act="payJail" ${p.money < JAIL_FINE ? 'disabled' : ''}>Штраф ${formatMoney(JAIL_FINE)}</button>`,
          );
        }
        return this.bar(p, title, s.extraRoll ? 'Дубль! Бросайте ещё раз.' : 'Бросьте кубики, чтобы сделать ход.', `<button class="btn green big" data-act="roll">Бросить кубики</button>${this.undoBtn()}`);
      case 'buy': {
        const cell = BOARD[p.position];
        const enough = p.money >= cell.price!;
        return this.bar(
          p,
          title,
          enough ? 'Участок свободен — можно купить.' : 'Не хватает денег — заложите улицы в «Имуществе» или пропустите (будет аукцион).',
          `<button class="btn green" data-act="buy" ${enough ? '' : 'disabled'}>Купить за ${formatMoney(cell.price!)}</button>
           <button class="btn yellow" data-act="decline">Пропустить</button>${this.undoBtn()}`,
        );
      }
      case 'debt': {
        const d = s.debts[0];
        return this.bar(
          p,
          `Долг ${formatMoney(d.amount)}`,
          `${d.creditor !== null ? `Игроку ${esc(game.player(d.creditor).name)}` : 'Банку'}. ${
            game.liquidationValue(p.id) >= d.amount
              ? `Можно выручить до ${formatMoney(game.liquidationValue(p.id) - p.money)}: продайте дома или заложите улицы в «Имуществе».`
              : `Даже продав всё, наберётся только ${formatMoney(game.liquidationValue(p.id))} — придётся объявить банкротство.`
          }`,
          `<button class="btn green" data-act="payDebt" ${p.money < d.amount ? 'disabled' : ''}>Оплатить</button>
           <button class="btn red" data-act="bankrupt">Банкрот</button>${this.undoBtn()}`,
        );
      }
      case 'end':
        return this.bar(p, title, last, `<button class="btn green big" data-act="endTurn">Завершить ход</button>${this.undoBtn()}`);
      default:
        return '';
    }
  }

  private modalHtml(): string {
    if (!this.game) return '';
    const game = this.game;
    const s = game.state;
    if (!this.modal && s.phase === 'trade' && s.trade && s.trade.to === this.me() && !game.player(s.trade.to).isBot) {
      return `<div class="overlay sticky"><div class="modal">${this.offerHtml()}</div></div>`;
    }
    if (!this.modal) return '';
    let body = '';
    if (this.modal === 'card' && s.lastCard) {
      const card = CARD_BY_ID[s.lastCard];
      body = `<div class="card-face ${card.deck}">
          <div class="deck-name">${card.deck === 'chance' ? '❓ Шанс' : '🎁 Сюрприз'}</div>
          <div class="card-text">${esc(card.text)}</div>
        </div>
        <button class="btn big green" data-act="close">OK</button>`;
    } else if (this.modal === 'log') {
      body = `<h3>Журнал</h3><div class="log">${s.log
        .slice(-60)
        .reverse()
        .map((l) => `<div>${esc(l)}</div>`)
        .join('')}</div><button class="btn blue" data-act="close">Закрыть</button>`;
    } else if (this.modal === 'order') {
      body = `<h3>🎲 Жеребьёвка</h3>
        <div class="hint">Порядок ходов выбран случайно</div>
        <div class="olist">${this.game!.state.players
          .map(
            (p, i) => `<div class="oline" style="--pc:${p.color};animation-delay:${0.25 + i * 0.35}s">
              <b>${i + 1}</b>${tk(p)}<span>${esc(p.name)}</span>${p.isBot ? '<i>бот</i>' : ''}</div>`,
          )
          .join('')}</div>
        <button class="btn green big" data-act="close">Начать игру</button>`;
    } else if (this.modal === 'payJailConfirm') {
      body = `<h3>Заплатить штраф ${formatMoney(JAIL_FINE)}?</h3>
        <div class="msg">Можно бесплатно попробовать выбросить дубль — у вас попытка ${(this.game?.player(this.me()).jailTurns ?? 0) + 1} из 3. Штраф платят, если не хотят ждать.</div>
        <button class="btn green" data-act="close">Лучше попробую дубль</button>
        <button class="btn yellow" data-act="payJailYes">Заплатить ${formatMoney(JAIL_FINE)} и выйти</button>`;
    } else if (this.modal === 'bankrupt') {
      body = `<h3>Объявить банкротство?</h3>
        <div class="msg">Всё имущество уйдёт кредитору, а вы выбудете из игры. Отменить это нельзя.</div>
        <button class="btn red" data-act="bankruptYes">Да, я банкрот</button>
        <button class="btn ghost" data-act="close">Отмена</button>`;
    } else if (this.modal === 'settings') {
      const tg = (on: boolean) => `<span class="toggle ${on ? 'on' : ''}"><i></i></span>`;
      body = `<h3>Настройки</h3>
        <div class="savestat ${this.store.status.kind}">${esc(this.statusText())}</div>
        <button class="setting" data-act="toggleSound"><span>Звук</span>${tg(this.prefs.sound)}</button>
        <button class="setting" data-act="toggleVibro"><span>Вибрация</span>${tg(this.prefs.vibrate)}</button>
        <button class="setting" data-act="toggleUnlimited"><span>Дома без лимита<small>домашнее правило: в банке не кончаются дома и отели (сейчас ${this.game ? `в банке ${this.game.state.housesLeft} домов, ${this.game.state.hotelsLeft} отелей` : '—'})</small></span>${tg(!!this.game?.state.rules?.unlimitedHouses)}</button>
        <button class="setting" data-act="toggleEdit"><span>Исправить владельцев<small>в карточке клетки появится выбор владельца</small></span>${tg(this.editOwners)}</button>
        <button class="btn blue" data-act="history">Вернуть партию назад</button>
        <button class="btn blue" data-act="showCode">Код партии (резервная копия)</button>
        <button class="btn red" data-act="menu">Выйти в главное меню</button>
        <button class="btn ghost" data-act="close">Закрыть</button>`;
    } else if (this.modal === 'conflict') {
      body = `<h3>Есть более новая версия</h3>
        <div class="msg">${esc(this.statusText())}</div>
        <button class="btn green" data-act="menu">Открыть меню партий</button>`;
    } else if (this.modal === 'code') {
      body = `<h3>Код партии</h3>
        <div class="hint">Сохраните этот код в «Заметках» или пришлите мне. Партию можно будет загрузить из главного меню: «Загрузить партию по коду».</div>
        <textarea id="codeOut" class="codebox" readonly>${this.game ? exportCode(this.game.state) : ''}</textarea>
        <button class="btn green" data-act="copyCode">Скопировать код</button>
        <button class="btn ghost" data-act="close">Закрыть</button>`;
    } else if (this.modal === 'import') {
      body = this.importHtml();
    } else if (this.modal === 'history') {
      body = this.historyHtml();
    } else if (this.modal.startsWith('rollback:')) {
      const e = this.histEntries?.[Number(this.modal.slice(9))];
      body = e
        ? `<h3>Вернуться к ходу ${e.state.turnNumber}?</h3>
          <div class="msg">${this.histSummary(e)}</div>
          <div class="msg">Всё, что было после, пропадёт.</div>
          <button class="btn green" data-act="rollbackYes" data-id="${this.modal.slice(9)}">Вернуться</button>
          <button class="btn ghost" data-act="history">Назад к списку</button>`
        : '';
    } else if (this.modal === 'trade' && this.draft) {
      body = this.tradeHtml(this.draft);
    } else if (this.modal === 'assets') {
      body = this.assetsHtml();
    } else if (this.modal.startsWith('cell:')) {
      body = this.cellCard(Number(this.modal.slice(5)));
    }
    return `<div class="overlay"><div class="modal">${body}</div></div>`;
  }

  /** «Моё имущество»: по цветовым группам, собранные монополии — первыми и выделены. */
  private assetsHtml(): string {
    const game = this.game!;
    const s = game.state;
    const me = this.me();
    const p = game.player(me);
    const owned = new Set(game.ownedBy(me));
    const item = (id: number) => {
      const c = BOARD[id];
      const own = s.cells[id];
      const status = own.mortgaged ? 'залог' : own.houses === 5 ? 'отель' : own.houses ? `${own.houses} ${own.houses === 1 ? 'дом' : 'дома'}` : '';
      const canBuild = game.can(me, { type: 'build', cell: id });
      return `<div class="asset">
        <button class="amain" data-cell="${id}">
          <span class="sw" style="background:${c.group ? GROUP_COLORS[c.group] : '#9b97c4'}"></span>
          <span class="an">${cellIcon(id, 'ico inline')} ${esc(c.name)}</span>
          <span class="ah">${status}</span>
        </button>
        ${canBuild ? `<button class="abuild" data-act="build" data-id="${id}" aria-label="Построить">${own.houses === 4 ? '+🏨' : '+🏠'}<small>${formatMoney(c.houseCost!)}</small></button>` : ''}
      </div>`;
    };
    const groups = (Object.keys(GROUP_NAMES) as ColorGroup[])
      .map((g) => {
        const ids = groupCells(g);
        const mine = ids.filter((id) => owned.has(id));
        if (!mine.length) return null;
        const mono = mine.length === ids.length;
        const mortgaged = mono && ids.some((id) => s.cells[id].mortgaged);
        const badge = mono
          ? mortgaged
            ? '<span class="gbadge warn">Монополия · выкупите залог, чтобы строить</span>'
            : '<span class="gbadge ok">★ Монополия — можно строить</span>'
          : `<span class="gbadge">${mine.length} из ${ids.length}</span>`;
        return {
          mono,
          html: `<div class="agroup ${mono ? 'mono' : ''}">
            <div class="ghead"><span class="gdot" style="background:${GROUP_COLORS[g]}"></span>${GROUP_NAMES[g][0].toUpperCase() + GROUP_NAMES[g].slice(1)} группа ${badge}</div>
            ${mine.map(item).join('')}
          </div>`,
        };
      })
      .filter((x): x is { mono: boolean; html: string } => !!x)
      .sort((a, b) => Number(b.mono) - Number(a.mono));
    const others = [...owned].filter((id) => !BOARD[id].group);
    const stations = others.filter((id) => BOARD[id].type === 'station');
    const utils = others.filter((id) => BOARD[id].type === 'utility');
    const extra = (title: string, ids: number[], total: number) =>
      ids.length
        ? `<div class="agroup"><div class="ghead">${title} <span class="gbadge">${ids.length} из ${total}</span></div>${ids.map(item).join('')}</div>`
        : '';
    const worth = game.netWorth(me) - p.money;
    return `<div class="asset-head" style="--pc:${p.color}">
        <h3>${tk(p)} Имущество: ${esc(p.name)}</h3>
        <div class="balance">
          <div><span>Баланс</span><b>${formatMoney(p.money)}</b></div>
          <div><span>Имущество</span><b>${formatMoney(worth)}</b></div>
        </div>
      </div>
      ${owned.size ? '' : '<p class="msg">Пока ничего нет. Покупайте улицы!</p>'}
      <div class="asset-list">
        ${groups.map((g) => g.html).join('')}
        ${extra('Вокзалы', stations, 4)}
        ${extra('Коммунальные службы', utils, 2)}
      </div>
      <button class="btn blue" data-act="close">Закрыть</button>`;
  }

  /** Входящее предложение обмена — целиком, с двумя колонками. */
  private offerHtml(): string {
    const game = this.game!;
    const o = game.state.trade!;
    const from = game.player(o.from);
    const me = game.player(o.to);
    const list = (cells: number[], money: number) => {
      const items = cells.map((id) => {
        const c = BOARD[id];
        const mort = this.game!.state.cells[id].mortgaged;
        return `<div class="oitem ${mort ? 'mort' : ''}"><span class="sw" style="background:${c.group ? GROUP_COLORS[c.group] : '#9b97c4'}"></span>${cellIcon(id, 'ico inline')}<span>${esc(c.name)}${mort ? ' <i>(в залоге)</i>' : ''}</span></div>`;
      });
      if (money) items.push(`<div class="oitem money">${formatMoney(money)}</div>`);
      return items.join('') || '<div class="empty">ничего</div>';
    };
    const after = me.money + o.giveMoney - o.getMoney;
    return `<div class="why why-trade">🤝 Вам предлагают обмен</div>
      <div class="ofrom">${tk(from)}<b>${esc(from.name)}</b> предлагает сделку</div>
      <div class="tcols">
        <div class="tside"><div class="ttitle">Вы получаете</div>${list(o.giveCells, o.giveMoney)}</div>
        <div class="tside"><div class="ttitle">Вы отдаёте</div>${list(o.getCells, o.getMoney)}</div>
      </div>
      <div class="hint">После сделки у вас будет ${formatMoney(after)}</div>
      <div class="row">
        <button class="btn yellow" data-act="rejectTrade">Отклонить</button>
        <button class="btn green" data-act="acceptTrade">Принять</button>
      </div>`;
  }

  private handoffHtml(): string {
    const p = this.game!.player(this.game!.actor());
    const phase = this.game!.state.phase;
    const [why, kind] =
      phase === 'trade'
        ? ['🤝 Вам предлагают обмен', 'trade']
        : phase === 'auction'
          ? ['🔨 Ваша ставка на аукционе', 'auction']
          : phase === 'debt'
            ? ['⚠️ Нужно заплатить долг', 'debt']
            : ['🎲 Ваш ход', 'turn'];
    return `<div class="overlay locked"><div class="modal handoff" style="--pc:${p.color}">
      <div class="big-token">${tk(p)}</div>
      <div class="msg">Передайте телефон</div>
      <div class="msg big">${esc(p.name)}</div>
      <div class="why why-${kind}">${why}</div>
      <button class="btn big green" data-act="ready">Поехали!</button>
    </div></div>`;
  }

  private tradeHtml(d: TradeDraft): string {
    const game = this.game!;
    const s = game.state;
    const partners = game.activePlayers().filter((p) => p.id !== d.from);
    const pick = `<div class="partners">${partners
      .map(
        (p) => `<button class="partner ${d.to === p.id ? 'sel' : ''}" style="--pc:${p.color}" data-act="tradeTo" data-id="${p.id}">
          ${tk(p)}${esc(p.name)}</button>`,
      )
      .join('')}</div>`;
    if (d.to < 0) {
      return `<h3>🤝 Обмен</h3><div class="msg">С кем меняемся?</div>${pick}
        <button class="btn ghost" data-act="close">Отмена</button>`;
    }
    const side = (owner: number, chosen: number[], money: number, key: 'give' | 'get', title: string) => {
      const cells = game.ownedBy(owner);
      const list = cells.length
        ? cells
            .map((id) => {
              const c = BOARD[id];
              const built = c.group ? groupCellsBuilt(game, c.group) : false;
              return `<button class="tcell ${chosen.includes(id) ? 'sel' : ''}" data-tcell="${id}" ${built ? 'disabled' : ''}>
                <span class="sw" style="background:${c.group ? GROUP_COLORS[c.group] : '#8892a6'}"></span>
                <span class="an">${cellIcon(id, 'ico inline')} ${esc(c.short ?? c.name)}${s.cells[id].mortgaged ? ' <i>(залог)</i>' : ''}</span>
                <span class="chk">${chosen.includes(id) ? '✔' : ''}</span>
              </button>`;
            })
            .join('')
        : '<div class="empty">Нет имущества</div>';
      const max = game.player(owner).money;
      return `<div class="tside">
        <div class="ttitle">${title}</div>
        <div class="tlist">${list}</div>
        <div class="tmoney">
          <span>${money.toLocaleString('ru-RU')} ₽</span>
          <button data-money="${key}:-1000">−1K</button><button data-money="${key}:-100">−100</button><button data-money="${key}:-10">−10</button>
          <button data-money="${key}:10">+10</button><button data-money="${key}:100">+100</button><button data-money="${key}:1000">+1K</button>
        </div>
        <div class="tmax">есть ${max.toLocaleString('ru-RU')} ₽</div>
      </div>`;
    };
    const partner = game.player(d.to);
    const noCells = !d.give.length && !d.get.length;
    const empty = noCells && !d.giveMoney && !d.getMoney;
    // Только свои деньги, ничего взамен — это перевод: сразу, без подтверждения.
    const isTransfer = noCells && d.giveMoney > 0 && !d.getMoney;
    let hint = '';
    if (partner.isBot && !empty && !isTransfer) {
      const gain = tradeGain(game, d.to, {
        from: d.from,
        to: d.to,
        giveCells: d.give,
        getCells: d.get,
        giveMoney: d.giveMoney,
        getMoney: d.getMoney,
      });
      hint = `<div class="thint ${gain > 0 ? 'ok' : 'no'}">${
        gain > 0 ? `${esc(partner.name)}, похоже, согласится 👍` : `${esc(partner.name)}, скорее всего, откажется 👎`
      }</div>`;
    }
    return `<h3>🤝 Обмен и переводы</h3>${pick}
      <div class="tcols">
        ${side(d.from, d.give, d.giveMoney, 'give', 'Вы отдаёте')}
        ${side(d.to, d.get, d.getMoney, 'get', `${esc(partner.name)} отдаёт`)}
      </div>
      <div class="hint">${
        isTransfer
          ? `Получатель: ${esc(partner.name)}. Деньги придут сразу, без подтверждения.`
          : 'Чтобы просто перевести деньги — укажите сумму слева и не выбирайте улиц. Улицы из групп с домами менять нельзя.'
      }</div>
      ${hint}
      <div class="row">
        <button class="btn ghost" data-act="close">Отмена</button>
        ${
          isTransfer
            ? `<button class="btn green" data-act="transferSend">Перевести ${formatMoney(d.giveMoney)}</button>`
            : `<button class="btn green" data-act="tradeSend" ${empty ? 'disabled' : ''}>Предложить</button>`
        }
      </div>`;
  }

  private async loadHistory(): Promise<void> {
    this.histEntries = null;
    this.render();
    this.histEntries =
      this.gameId && this.game ? (await this.store.listTurns(this.gameId, this.game.state.turnNumber)).slice(0, TURN_SLOTS) : [];
    if (this.modal === 'history') this.render();
  }

  private histSummary(e: TurnSnap): string {
    const t = e.savedAt ? new Date(e.savedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';
    const money = e.state.players
      .filter((p) => !p.bankrupt)
      .map((p) => `${esc(p.name)} ${p.money.toLocaleString('ru-RU')} ₽`)
      .join(' · ');
    return `${t ? `${t} · ` : ''}ходит ${esc(e.state.players[e.state.current].name)}<br>${money}`;
  }

  private historyHtml(): string {
    const list = this.histEntries;
    const items =
      list === null
        ? '<div class="hint wait">Загружаем историю…</div>'
        : list.length
          ? list
              .map(
                (e, i) => `<button class="hitem" data-act="rollback" data-id="${i}">
                  <b>Ход ${e.state.turnNumber}</b><span>${this.histSummary(e)}</span></button>`,
              )
              .join('')
          : '<div class="hint">Пока нет сохранённых ходов. Они появятся по ходу игры.</div>';
    return `<h3>Вернуть партию назад</h3>
      <div class="hint">Игра помнит начало ${TURN_SLOTS} последних ходов этой партии.</div>
      <div class="hlist">${items}</div>
      <button class="btn ghost" data-act="close">Закрыть</button>`;
  }

  /** Ручная правка владельца (режим «Исправить владельцев»). */
  private setOwner(id: number, owner: number | null): void {
    const game = this.game!;
    const s = game.state;
    if (this.busy || (s.phase !== 'roll' && s.phase !== 'end')) {
      this.showToast('Править владельцев можно в начале или в конце хода');
      return;
    }
    const c = BOARD[id];
    s.cells[id].owner = owner;
    if (owner === null) s.cells[id].mortgaged = false;
    // Если группа перестала быть монополией — дома возвращаются банку.
    if (c.group) {
      const ids = groupCells(c.group);
      const first = s.cells[ids[0]].owner;
      const full = first !== null && ids.every((g) => s.cells[g].owner === first);
      if (!full) {
        for (const g of ids) {
          const h = s.cells[g].houses;
          if (h === 5) s.hotelsLeft++;
          else s.housesLeft += h;
          s.cells[g].houses = 0;
        }
      }
    }
    this.save();
    this.render();
    this.showToast(`Владелец «${c.name}»: ${owner === null ? 'банк' : game.player(owner).name}`);
  }

  /** Почему с улицей сейчас нельзя что-то сделать — подсказки под кнопками. */
  /** Почему действие сейчас недоступно — текст правила из движка (или null, если доступно). */
  private whyNot(player: number, action: Action): string | null {
    const copy = new Game(structuredClone(this.game!.state));
    try {
      copy.dispatch(player, action);
      return null;
    } catch (e) {
      return e instanceof GameError ? e.message.charAt(0).toLowerCase() + e.message.slice(1) : null;
    }
  }

  private manageHints(id: number): string[] {
    const game = this.game!;
    const s = game.state;
    const me = this.me();
    const c = BOARD[id];
    const own = s.cells[id];
    const myTurn = game.actor() === me && ['roll', 'end', 'buy', 'auction', 'debt'].includes(s.phase);
    if (!myTurn) {
      return [`Сейчас ход другого игрока. Управлять имуществом можно в свой ход.`];
    }
    const hints: string[] = [];
    if (s.phase === 'debt') hints.push('Пока есть долг, можно только продавать дома и закладывать.');
    if (c.type === 'property' && s.phase !== 'debt') {
      const ids = groupCells(c.group!);
      const have = ids.filter((g) => s.cells[g].owner === me).length;
      const acc = GROUP_NAMES[c.group!].replace(/ая$/, 'ую').replace(/яя$/, 'юю');
      if (have < ids.length) {
        hints.push(`Чтобы строить, соберите всю ${acc} группу: у вас ${have} из ${ids.length}.`);
      } else if (own.houses < 5) {
        const why = this.whyNot(me, { type: 'build', cell: id });
        if (why) hints.push(`Построить нельзя: ${why}.`);
      }
    }
    if (own.houses > 0) {
      const why = this.whyNot(me, { type: 'sellHouse', cell: id });
      if (why) hints.push(`Продать дом нельзя: ${why}.`);
    }
    if (!own.mortgaged && own.houses === 0) {
      const why = this.whyNot(me, { type: 'mortgage', cell: id });
      if (why && c.group && groupCells(c.group).some((g) => s.cells[g].houses > 0)) hints.push('Чтобы заложить, сначала продайте все дома в группе.');
    } else if (!own.mortgaged && c.group) {
      hints.push('Чтобы заложить, сначала продайте все дома в группе.');
    }
    if (own.mortgaged && s.phase !== 'debt') {
      const why = this.whyNot(me, { type: 'unmortgage', cell: id });
      if (why) hints.push(`Выкупить нельзя: ${why}.`);
    }
    const supply = s.rules?.unlimitedHouses
      ? ''
      : `В банке: ${s.housesLeft} ${plural(s.housesLeft, 'дом', 'дома', 'домов')} и ${s.hotelsLeft} ${plural(s.hotelsLeft, 'отель', 'отеля', 'отелей')}.`;
    if (c.type === 'property' && supply && (s.housesLeft <= 4 || hints.some((h) => h.includes('закончились')))) {
      hints.push(`${supply} Дома возвращаются в банк, когда их продают, а отель освобождает 4 дома. Можно снять лимит: меню ☰ → «Дома без лимита».`);
    }
    return hints;
  }

  private cellCard(id: number): string {
    const game = this.game!;
    const c = BOARD[id];
    const own = game.state.cells[id];
    const me = this.me();
    const owner = own.owner !== null ? game.player(own.owner) : null;
    let rows = '';
    if (c.type === 'property') {
      const labels = ['Аренда', 'С 1 домом', 'С 2 домами', 'С 3 домами', 'С 4 домами', 'С отелем'];
      rows = c.rent!
        .map((r, i) => `<tr class="${own.houses === i && owner ? 'cur' : ''}"><td>${labels[i]}</td><td>${formatMoney(r)}</td></tr>`)
        .join('');
      rows += `<tr><td colspan="2" class="note">Вся группа без домов — аренда ×2</td></tr>
        <tr><td>Дом / отель</td><td>${formatMoney(c.houseCost!)}</td></tr>`;
    } else if (c.type === 'station') {
      rows = STATION_RENT.map((r, i) => `<tr><td>${i + 1} вокзал${i ? 'а' : ''}</td><td>${formatMoney(r)}</td></tr>`).join('');
    } else if (c.type === 'utility') {
      rows = `<tr><td>Одна служба</td><td>${UTILITY_MULT[0]} × кубики</td></tr>
        <tr><td>Обе службы</td><td>${UTILITY_MULT[1]} × кубики</td></tr>`;
    } else if (c.type === 'tax') {
      rows = `<tr><td>Налог</td><td>${formatMoney(c.amount!)}</td></tr>`;
    }
    if (isOwnable(c)) {
      rows += `<tr><td>Залог</td><td>${formatMoney(c.price! / 2)}</td></tr>`;
    }
    const btn = (act: string, label: string, cls: string) =>
      game.can(me, { type: act, cell: id } as Action)
        ? `<button class="btn ${cls}" data-act="${act}" data-id="${id}">${label}</button>`
        : '';
    const actions =
      own.owner === me
        ? [
            btn('build', own.houses === 4 ? '🏨 Отель' : '🏠 Дом', 'green'),
            btn('sellHouse', 'Продать дом', 'yellow'),
            btn('mortgage', `Заложить +${formatMoney(c.price! / 2)}`, 'red'),
            btn('unmortgage', `Выкупить ${formatMoney(Game.unmortgageCost(c))}`, 'blue'),
          ].join('')
        : '';
    const hints = own.owner === me ? this.manageHints(id) : [];
    const editor =
      this.editOwners && isOwnable(c)
        ? `<div class="oedit"><div class="hint">Владелец (ручная правка):</div><div class="row wrap">${game.state.players
            .filter((p) => !p.bankrupt)
            .map(
              (p) =>
                `<button class="btn ${own.owner === p.id ? 'green' : 'yellow'} sm" data-act="setOwner" data-id="${id}" data-owner="${p.id}">${esc(p.name)}</button>`,
            )
            .join('')}<button class="btn ${own.owner === null ? 'green' : 'yellow'} sm" data-act="setOwner" data-id="${id}" data-owner="bank">Банк</button></div></div>`
        : '';
    return `<div class="deed">
        <div class="deed-head" style="background:${c.group ? GROUP_COLORS[c.group] : '#3b4b66'}">
          <div class="deed-icon">${cellIcon(id)}</div>
          <div class="deed-name">${esc(c.name)}</div>
          ${c.price ? `<div class="deed-price">${formatMoney(c.price)}</div>` : ''}
        </div>
        <table>${rows}</table>
        <div class="deed-owner">${
          owner ? `Владелец: <b style="color:${owner.color}">${tk(owner)} ${esc(owner.name)}</b>${own.mortgaged ? ' · в залоге' : ''}` : isOwnable(c) ? 'Свободно' : ''
        }</div>
      </div>
      <div class="row wrap">${actions}</div>
      ${hints.length ? `<div class="mhints">${hints.map((h) => `<div>${esc(h)}</div>`).join('')}</div>` : ''}
      ${editor}
      <button class="btn ghost" data-act="close">Закрыть</button>`;
  }
}
