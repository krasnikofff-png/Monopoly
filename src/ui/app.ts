import { BOARD, GROUP_COLORS, JAIL_FINE, START_BONUS, STATION_RENT, UTILITY_MULT, groupCells, isOwnable } from '../data/board';
import { CARD_BY_ID } from '../data/cards';
import { botDecide, tradeGain } from '../engine/bot';
import { iconSvg, installIcons } from './icons';
import { normalizeToken, tokenSvg } from './tokens';
import { Sound, type SoundName } from './sound';
import { CloudSave } from './cloud';
import { RESTORE_LABEL, restoredDavidYana } from './restore';
import { confetti, floatText, flyCoins, shake, tweenNumber } from './fx';
import { Game, GameError, PLAYER_COLORS, PLAYER_TOKENS, formatMoney } from '../engine/game';
import type { Action, ColorGroup, GameEvent, GameState } from '../engine/types';

type Notice = Extract<GameEvent, { kind: 'notice' }>;

const SAVE_KEY = 'moskva-magnat-save-v1';
const SETUP_KEY = 'moskva-magnat-setup-v1';

interface SetupRow {
  name: string;
  isBot: boolean;
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
  private cloud = new CloudSave();
  /** Сохранение из облака (подгружается асинхронно при запуске). */
  private cloudState: GameState | null = null;
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

  constructor(root: HTMLElement, resume?: GameState | null) {
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
    root.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.dataset.name !== undefined) this.setup[Number(t.dataset.name)].name = t.value;
    });
    const hot = resume ? parseSave(JSON.stringify(resume)) : null;
    if (hot) this.startGame(new Game(hot));
    else this.renderMenu();
    void this.cloud.load().then((payload) => {
      this.cloudState = payload ? parseSave(payload.json) : null;
      if (!this.game) this.renderMenu();
    });
  }

  /** Текущая партия — для передачи в новую версию страницы при обновлении. */
  snapshot(): GameState | null {
    return this.game && this.game.state.phase !== 'gameover' ? this.game.state : null;
  }

  // ——————————————————— Меню ———————————————————

  private loadSetup(): SetupRow[] {
    try {
      const raw = localStorage.getItem(SETUP_KEY);
      const rows = raw ? (JSON.parse(raw) as SetupRow[]) : null;
      if (rows && rows.length >= 2 && rows.length <= 6) return rows;
    } catch {
      /* настройки по умолчанию */
    }
    return [
      { name: 'Игрок', isBot: false },
      { name: 'Олег', isBot: true },
      { name: 'Марина', isBot: true },
      { name: 'Тимур', isBot: true },
    ];
  }

  private renderMenu(): void {
    const hasSave = !!this.loadSave();
    const rows = this.setup;
    const humans = rows.filter((r) => !r.isBot).length;
    this.root.innerHTML = `
      <div class="menu">
        <div class="logo"><span>МОСКВА</span><b>МАГНАТ</b></div>
        <div class="menu-card">
          <div class="menu-title">Игроки</div>
          <div class="setup-list">
            ${rows
              .map(
                (r, i) => `<div class="setup-row" style="--pc:${PLAYER_COLORS[i]}">
                <span class="tok">${tokenSvg(PLAYER_TOKENS[i], PLAYER_COLORS[i])}</span>
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
          ${hasSave ? `<button class="btn big blue" data-act="continue">Продолжить</button>` : ''}
          ${hasSave ? '' : `<button class="btn ghost" data-act="restore">Восстановить: ${RESTORE_LABEL}</button>`}
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
    this.setup = rows;
    this.saveSetup();
    this.startGame(
      Game.create(rows.map((r, i) => ({ name: r.name, isBot: r.isBot, color: PLAYER_COLORS[i], token: PLAYER_TOKENS[i] }))),
    );
  }

  private startGame(game: Game): void {
    for (const p of game.state.players) p.token = normalizeToken(p.token);
    this.game = game;
    this.shownPos = game.state.players.map((p) => p.position);
    this.shownMoney = game.state.players.map((p) => p.money);
    this.prevCurrent = game.state.current;
    if (game.state.dice) this.diceShown = game.state.dice;
    this.modal = null;
    this.render();
    this.scheduleBot();
  }

  /** Самое свежее сохранение: из памяти браузера или из облака. */
  private loadSave(): GameState | null {
    let local: GameState | null = null;
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) local = parseSave(raw);
    } catch {
      /* память браузера недоступна */
    }
    const cloud = this.cloudState;
    if (!local) return cloud;
    if (!cloud) return local;
    const score = (g: GameState) => g.turnNumber * 1000 + g.log.length;
    return score(cloud) >= score(local) ? cloud : local;
  }

  private save(): void {
    if (!this.game) return;
    const json = JSON.stringify(this.game.state);
    this.cloud.save(json);
    try {
      localStorage.setItem(SAVE_KEY, json);
    } catch {
      /* хранилище недоступно — играем без сохранения */
    }
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
    if (game.state.phase === 'gameover') return false;
    const actor = game.actor();
    if (game.player(actor).isBot || actor === this.holder) return false;
    if (this.humanCount() <= 1) {
      this.holder = actor;
      return false;
    }
    return true;
  }

  private async act(playerId: number, action: Action): Promise<void> {
    const game = this.game!;
    if (this.busy) return;
    try {
      game.dispatch(playerId, action);
    } catch (e) {
      if (e instanceof GameError) {
        this.showToast(e.message);
        return;
      }
      throw e;
    }
    this.save();
    this.busy = true;
    await this.play(game.drainEvents());
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

  private async play(events: GameEvent[]): Promise<void> {
    const game = this.game!;
    for (let i = 0; i < events.length; i++) {
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
            this.showToast(`${game.player(o.to).name} отклоняет обмен`);
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
    while (pos !== to) {
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
    this.render();
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
      if (this.busy || this.modal === 'card') return this.scheduleBot();
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
      case 'restore': {
        const st = restoredDavidYana();
        this.startGame(new Game(st));
        this.save();
        return;
      }
      case 'continue': {
        const s = this.loadSave();
        if (s) this.startGame(new Game(s));
        return;
      }
      case 'menu':
        if (this.botTimer !== null) clearTimeout(this.botTimer);
        this.botTimer = null;
        this.game = null;
        this.modal = null;
        return this.renderMenu();
      case 'close':
        this.draft = null;
        return this.closeModal();
      case 'settings':
        this.modal = 'settings';
        return this.render();
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
      case 'payJail':
      case 'useJailCard':
      case 'payDebt':
      case 'acceptTrade':
      case 'rejectTrade':
        void this.act(me, { type: act } as Action);
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

  // ——————————————————— Отрисовка ———————————————————

  private render(): void {
    const game = this.game;
    if (!game) return;
    const s = game.state;
    const sum = s.dice ? s.dice[0] + s.dice[1] : null;
    // Запоминаем, где были фишки, чтобы анимировать перелёт (FLIP).
    const prev = new Map<string, DOMRect>();
    this.root.querySelectorAll<HTMLElement>('[data-tok]').forEach((el) => prev.set(el.dataset.tok!, el.getBoundingClientRect()));
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
        <div class="players">${s.players.map((p) => this.playerChip(p.id)).join('')}</div>
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
    const tokens = game.state.players
      .filter((p) => !p.bankrupt && this.shownPos[p.id] === id)
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
      <div class="tokens">${tokens}</div>
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
      return `<div class="mycards empty"><span>${tk(p)} У ${esc(p.name)} пока нет улиц</span></div>`;
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
    if (isOwnable(c)) {
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

  private bar(p: { token: string; color: string } | null, title: string, sub: string, btns: string, wait = false): string {
    return `<div class="who">${p ? `<div class="pedestal" style="--pc:${p.color}">${tk(p)}</div>` : ''}</div>
      <div class="info"><div class="atitle">${title}</div><div class="asub ${wait ? 'wait' : ''}">${sub}</div></div>
      <div class="btns">${btns}</div>`;
  }

  private panelHtml(): string {
    const game = this.game!;
    const s = game.state;
    const me = this.me();
    const actor = game.actor();
    const last = esc(s.log[s.log.length - 1] ?? '');
    if (this.busy) {
      const cur = game.player(s.current);
      return this.bar(cur, `Ход: ${esc(cur.name)}`, this.rolling ? 'Бросаем кубики…' : 'Фишка в пути…', '', true);
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
      const sub = `${actor === me ? `«${esc(cell.name)}», цена ${formatMoney(cell.price!)}. ` : ''}Ставка <b>${formatMoney(a.bid)}</b> · лидер: ${leader}`;
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
             ${
               p.jailFreeCards.length
                 ? `<button class="btn yellow" data-act="useJailCard">Карточка «Выйти»</button>`
                 : `<button class="btn yellow" data-act="payJail" ${p.money < JAIL_FINE ? 'disabled' : ''}>Штраф ${formatMoney(JAIL_FINE)}</button>`
             }`,
          );
        }
        return this.bar(p, title, s.extraRoll ? 'Дубль! Бросайте ещё раз.' : 'Бросьте кубики, чтобы сделать ход.', `<button class="btn green big" data-act="roll">Бросить кубики</button>`);
      case 'buy': {
        const cell = BOARD[p.position];
        const enough = p.money >= cell.price!;
        return this.bar(
          p,
          title,
          enough ? 'Участок свободен — можно купить.' : 'Не хватает денег — заложите улицы в «Имуществе» или пропустите (будет аукцион).',
          `<button class="btn green" data-act="buy" ${enough ? '' : 'disabled'}>Купить за ${formatMoney(cell.price!)}</button>
           <button class="btn yellow" data-act="decline">Пропустить</button>`,
        );
      }
      case 'debt': {
        const d = s.debts[0];
        return this.bar(
          p,
          `Долг ${formatMoney(d.amount)}`,
          `${d.creditor !== null ? `Игроку ${esc(game.player(d.creditor).name)}` : 'Банку'}. Продайте дома или заложите улицы в «Имуществе».`,
          `<button class="btn green" data-act="payDebt" ${p.money < d.amount ? 'disabled' : ''}>Оплатить</button>
           <button class="btn red" data-act="bankrupt">Банкрот</button>`,
        );
      }
      case 'end':
        return this.bar(p, title, last, `<button class="btn green big" data-act="endTurn">Завершить ход</button>`);
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
    } else if (this.modal === 'bankrupt') {
      body = `<h3>Объявить банкротство?</h3>
        <div class="msg">Всё имущество уйдёт кредитору, а вы выбудете из игры. Отменить это нельзя.</div>
        <button class="btn red" data-act="bankruptYes">Да, я банкрот</button>
        <button class="btn ghost" data-act="close">Отмена</button>`;
    } else if (this.modal === 'settings') {
      const tg = (on: boolean) => `<span class="toggle ${on ? 'on' : ''}"><i></i></span>`;
      body = `<h3>Настройки</h3>
        <button class="setting" data-act="toggleSound"><span>Звук</span>${tg(this.prefs.sound)}</button>
        <button class="setting" data-act="toggleVibro"><span>Вибрация</span>${tg(this.prefs.vibrate)}</button>
        <button class="btn red" data-act="menu">Выйти в главное меню</button>
        <button class="btn ghost" data-act="close">Закрыть</button>`;
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
      return `<button class="asset" data-cell="${id}">
        <span class="sw" style="background:${c.group ? GROUP_COLORS[c.group] : '#9b97c4'}"></span>
        <span class="an">${cellIcon(id, 'ico inline')} ${esc(c.name)}</span>
        <span class="ah">${status}</span>
      </button>`;
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
    return `<h3 style="--pc:${p.color}">${tk(p)} Имущество: ${esc(p.name)}</h3>
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
        return `<div class="oitem"><span class="sw" style="background:${c.group ? GROUP_COLORS[c.group] : '#9b97c4'}"></span>${cellIcon(id, 'ico inline')}<span>${esc(c.name)}</span></div>`;
      });
      if (money) items.push(`<div class="oitem money">${formatMoney(money)}</div>`);
      return items.join('') || '<div class="empty">ничего</div>';
    };
    const after = me.money + o.giveMoney - o.getMoney;
    return `<h3>Предложение обмена</h3>
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
    const why = this.game!.state.phase === 'trade' ? 'Вам предлагают обмен' : this.game!.state.phase === 'auction' ? 'Ваша ставка на аукционе' : this.game!.state.phase === 'debt' ? 'Нужно заплатить долг' : 'Ваш ход';
    return `<div class="overlay locked"><div class="modal handoff" style="--pc:${p.color}">
      <div class="big-token">${tk(p)}</div>
      <div class="msg">Передайте телефон</div>
      <div class="msg big">${esc(p.name)}</div>
      <div class="msg">${why}</div>
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
          <button data-money="${key}:-1000">−1K</button><button data-money="${key}:-100">−100</button>
          <span>${money.toLocaleString('ru-RU')} ₽</span>
          <button data-money="${key}:100">+100</button><button data-money="${key}:1000">+1K</button>
        </div>
        <div class="tmax">есть ${max.toLocaleString('ru-RU')} ₽</div>
      </div>`;
    };
    const partner = game.player(d.to);
    const empty = !d.give.length && !d.get.length;
    let hint = '';
    if (partner.isBot && !empty) {
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
    return `<h3>🤝 Обмен</h3>${pick}
      <div class="tcols">
        ${side(d.from, d.give, d.giveMoney, 'give', 'Вы отдаёте')}
        ${side(d.to, d.get, d.getMoney, 'get', `${esc(partner.name)} отдаёт`)}
      </div>
      <div class="hint">Улицы из групп с домами менять нельзя.</div>
      ${hint}
      <div class="row">
        <button class="btn ghost" data-act="close">Отмена</button>
        <button class="btn green" data-act="tradeSend" ${empty ? 'disabled' : ''}>Предложить</button>
      </div>`;
  }

  /** Почему с улицей сейчас нельзя что-то сделать — подсказки под кнопками. */
  private manageHints(id: number): string[] {
    const game = this.game!;
    const s = game.state;
    const me = this.me();
    const c = BOARD[id];
    const own = s.cells[id];
    const p = game.player(me);
    const can = (type: string) => game.can(me, { type, cell: id } as Action);
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
      } else if (ids.some((g) => s.cells[g].mortgaged)) {
        hints.push('Чтобы строить, выкупите заложенные улицы этой группы.');
      } else if (own.houses < 5 && !can('build')) {
        const min = Math.min(...ids.map((g) => s.cells[g].houses));
        if (own.houses > min) hints.push('Стройте равномерно: сначала поставьте дом на другие улицы группы.');
        else if (p.money < c.houseCost!) hints.push(`На дом нужно ${formatMoney(c.houseCost!)}, у вас ${formatMoney(p.money)}.`);
      }
    }
    if (c.group && !own.mortgaged && !can('mortgage') && groupCells(c.group).some((g) => s.cells[g].houses > 0)) {
      hints.push('Чтобы заложить, сначала продайте все дома в группе.');
    }
    if (own.mortgaged && s.phase !== 'debt' && !can('unmortgage')) {
      hints.push(`На выкуп из залога нужно ${formatMoney(Game.unmortgageCost(c))}, у вас ${formatMoney(p.money)}.`);
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
      <button class="btn ghost" data-act="close">Закрыть</button>`;
  }
}
