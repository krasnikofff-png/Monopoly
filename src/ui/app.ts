import { BOARD, GROUP_COLORS, JAIL_FINE, STATION_RENT, UTILITY_MULT, groupCells, isOwnable } from '../data/board';
import { CARD_BY_ID } from '../data/cards';
import { botDecide, tradeGain } from '../engine/bot';
import { iconSvg, installIcons } from './icons';
import { normalizeToken, tokenSvg } from './tokens';
import { Game, GameError, PLAYER_COLORS, PLAYER_TOKENS, formatMoney } from '../engine/game';
import type { Action, ColorGroup, GameEvent, GameState } from '../engine/types';

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
const STEP_MS = 140;
const BOT_DELAY = 650;

function groupCellsBuilt(game: Game, group: ColorGroup): boolean {
  return groupCells(group).some((id) => game.state.cells[id].houses > 0);
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

  constructor(root: HTMLElement) {
    this.root = root;
    installIcons();
    this.setup = this.loadSetup();
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.dataset.name !== undefined) this.setup[Number(t.dataset.name)].name = t.value;
    });
    this.renderMenu();
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
    if (game.state.dice) this.diceShown = game.state.dice;
    this.modal = null;
    this.render();
    this.scheduleBot();
  }

  private loadSave(): GameState | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw) as GameState;
      return s.version === 1 && s.phase !== 'gameover' ? s : null;
    } catch {
      return null;
    }
  }

  private save(): void {
    if (!this.game) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.game.state));
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

  private async play(events: GameEvent[]): Promise<void> {
    for (const e of events) {
      switch (e.kind) {
        case 'dice':
          await this.animateDice(e.dice);
          break;
        case 'move':
          await this.animateMove(e.player, e.to, e.direct);
          break;
        case 'card':
          this.modal = 'card';
          this.render();
          if (this.game!.player(this.game!.state.current).isBot) {
            await sleep(1600);
            this.modal = null;
          } else {
            await this.waitModalClosed();
          }
          break;
        case 'money':
          this.floatMoney(e.player, e.delta);
          break;
        case 'bankrupt':
          this.showToast(`${this.game!.player(e.player).name} — банкрот!`);
          break;
        case 'trade': {
          const o = e.offer;
          this.showToast(`${this.game!.player(o.to).name} ${e.accepted ? 'принимает ✅' : 'отклоняет ❌'} обмен`);
          break;
        }
        default:
          break;
      }
    }
  }

  private async animateDice(dice: [number, number]): Promise<void> {
    this.rolling = true;
    for (let i = 0; i < 7; i++) {
      this.diceShown = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
      this.render();
      await sleep(60);
    }
    this.rolling = false;
    this.diceShown = dice;
    this.render();
    await sleep(350);
  }

  private async animateMove(player: number, to: number, direct: boolean): Promise<void> {
    if (direct) {
      this.shownPos[player] = to;
      this.render();
      await sleep(300);
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
      navigator.vibrate?.(8);
      await sleep(STEP_MS);
    }
    await sleep(150);
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

  private floatMoney(player: number, delta: number): void {
    const chip = this.root.querySelector(`[data-chip="${player}"]`);
    if (!chip) return;
    const el = document.createElement('div');
    el.className = `float ${delta > 0 ? 'plus' : 'minus'}`;
    el.textContent = `${delta > 0 ? '+' : '−'}${Math.abs(delta).toLocaleString('ru-RU')}`;
    chip.appendChild(el);
    window.setTimeout(() => el.remove(), 1200);
  }

  private onClick(e: Event): void {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act],[data-cell],[data-bid],[data-tcell],[data-money]');
    if (!t) {
      const el = e.target as HTMLElement;
      if (el.classList.contains('overlay') && !el.classList.contains('locked')) this.closeModal();
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
        if (confirm('Объявить банкротство? Вы выбываете из игры.')) void this.act(me, { type: 'bankrupt' });
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
    this.root.innerHTML = `
      <div class="game">
        <div class="topbar">
          <button class="icon" data-act="menu">☰</button>
          <div class="players">${s.players.map((p) => this.playerChip(p.id)).join('')}</div>
          <button class="icon" data-act="log">📜</button>
        </div>
        <div class="board-wrap"><div class="board">${BOARD.map((c) => this.cellHtml(c.id)).join('')}
          <div class="center">
            <div class="logo small"><span>МОСКВА</span><b>МАГНАТ</b></div>
            <div class="dice ${this.rolling ? 'rolling' : ''}">
              <div class="die">${pips(this.diceShown[0])}</div><div class="die">${pips(this.diceShown[1])}</div>
            </div>
            <div class="last-log">${esc(s.log[s.log.length - 1] ?? '')}</div>
          </div>
        </div></div>
        <div class="panel">${this.panelHtml()}</div>
        ${this.needsHandoff() ? this.handoffHtml() : this.modalHtml()}
        ${this.toast ? `<div class="toast">${esc(this.toast)}</div>` : ''}
      </div>`;
  }

  private playerChip(id: number): string {
    const game = this.game!;
    const p = game.player(id);
    const active = game.state.current === id && game.state.phase !== 'gameover';
    return `<div class="chip ${active ? 'active' : ''} ${p.bankrupt ? 'out' : ''}" data-chip="${id}" style="--pc:${p.color}">
      <span class="tok">${tk(p)}</span>
      <span class="pn">${esc(p.name)}${p.inJail ? ' 🔒' : ''}</span>
      <span class="pm">${p.bankrupt ? 'банкрот' : p.money.toLocaleString('ru-RU')}</span>
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
      .map((p) => `<span class="token">${tk(p)}</span>`)
      .join('');
    const houses =
      own.houses === 5 ? '<span class="hotel"></span>' : '<span class="house"></span>'.repeat(own.houses);
    const label = c.short ?? c.name;
    return `<div class="cell ${side} t-${c.type} ${own.mortgaged ? 'mortgaged' : ''}" data-cell="${id}"
        style="grid-row:${row};grid-column:${col};${owner ? `--oc:${owner.color}` : ''}">
      ${c.group ? `<div class="strip" style="background:${GROUP_COLORS[c.group]}">${houses}</div>` : ''}
      <div class="cbody">
        ${c.type === 'property' ? '' : `<div class="cicon">${cellIcon(id)}</div>`}
        ${c.type === 'property' || side === 'corner' ? `<div class="cname">${esc(label)}</div>` : ''}
        ${c.price ? `<div class="cprice">${(c.price / 1000).toLocaleString('ru-RU')}K</div>` : ''}
      </div>
      ${owner ? '<div class="owner-mark"></div>' : ''}
      <div class="tokens">${tokens}</div>
    </div>`;
  }

  private panelHtml(): string {
    const game = this.game!;
    const s = game.state;
    const me = this.me();
    const actor = game.actor();

    if (s.phase === 'gameover') {
      const w = s.winner !== null ? game.player(s.winner) : null;
      return `<div class="msg big">🏆 ${w ? `${esc(w.name)} побеждает!` : 'Игра окончена'}</div>
        <button class="btn big green" data-act="menu">В меню</button>`;
    }
    const p = game.player(Math.max(0, me));
    if (me < 0) {
      return `<div class="msg">Все люди выбыли. Боты доигрывают партию…</div>
        <button class="btn blue" data-act="menu">В меню</button>`;
    }
    if (s.phase === 'auction' && s.auction) {
      const a = s.auction;
      const cell = BOARD[a.cell];
      const leader = a.bidder !== null ? game.player(a.bidder).name : '—';
      const head = `<div class="msg">Аукцион: <b>${esc(cell.name)}</b> (цена ${formatMoney(cell.price!)})<br>
        Ставка: <b>${formatMoney(a.bid)}</b> · лидер: ${esc(leader)}</div>`;
      if (actor !== me) return head + `<div class="wait">${esc(game.player(actor).name)} думает…</div>`;
      return (
        head +
        `<div class="row">${[10, 100, 500]
          .map((d) => `<button class="btn green" data-bid="${d}" ${a.bid + d > p.money ? 'disabled' : ''}>+${d}</button>`)
          .join('')}<button class="btn red" data-act="pass">Пас</button></div>`
      );
    }
    if (s.phase === 'trade' && s.trade) {
      const o = s.trade;
      if (o.to !== me) return `<div class="wait">${esc(game.player(o.to).name)} рассматривает обмен…</div>`;
      const list = (cells: number[], money: number) =>
        [...cells.map((id) => esc(BOARD[id].name)), money ? formatMoney(money) : ''].filter(Boolean).join(', ') || 'ничего';
      return `<div class="msg"><b>${esc(game.player(o.from).name)}</b> предлагает обмен:<br>
          Вы получаете: <b>${list(o.giveCells, o.giveMoney)}</b><br>
          Вы отдаёте: <b>${list(o.getCells, o.getMoney)}</b></div>
        <div class="row"><button class="btn green" data-act="acceptTrade">Принять</button>
        <button class="btn red" data-act="rejectTrade">Отклонить</button></div>`;
    }
    if (actor !== me) {
      return `<div class="wait">Ходит ${esc(game.player(actor).name)}…</div>`;
    }

    const tradeBtn = `<button class="btn yellow" data-act="trade">🤝 Обмен</button>`;
    const assets = `<button class="btn blue" data-act="assets">🏠 Имущество</button>`;
    const whose =
      this.humanCount() > 1 ? `<div class="turn-of" style="--pc:${p.color}">${tk(p)} Ход: <b>${esc(p.name)}</b></div>` : '';
    switch (s.phase) {
      case 'roll':
        if (p.inJail) {
          return `${whose}<div class="msg">Вы в тюрьме (попытка ${p.jailTurns + 1} из 3)</div>
            <div class="row">
              <button class="btn green" data-act="roll">🎲 На дубль</button>
              <button class="btn yellow" data-act="payJail" ${p.money < JAIL_FINE ? 'disabled' : ''}>Штраф ${JAIL_FINE}</button>
              ${p.jailFreeCards.length ? `<button class="btn blue" data-act="useJailCard">Карточка</button>` : ''}
            </div><div class="row">${assets}${tradeBtn}</div>`;
        }
        return `${whose}<button class="btn huge green" data-act="roll">🎲 Бросить кубики</button><div class="row">${assets}${tradeBtn}</div>`;
      case 'buy': {
        const cell = BOARD[p.position];
        return `<div class="msg">Купить <b>${esc(cell.name)}</b>?</div>
          <div class="row">
            <button class="btn green" data-act="buy" ${p.money < cell.price! ? 'disabled' : ''}>Купить ${formatMoney(cell.price!)}</button>
            <button class="btn red" data-act="decline">Аукцион</button>
          </div>
          <div class="row"><button class="btn ghost" data-cell="${cell.id}">Подробнее</button></div>`;
      }
      case 'debt': {
        const d = s.debts[0];
        return `<div class="msg">Нужно заплатить <b>${formatMoney(d.amount)}</b>${
          d.creditor !== null ? ` игроку ${esc(game.player(d.creditor).name)}` : ' банку'
        }. Продайте дома или заложите улицы.</div>
          <div class="row">
            <button class="btn green" data-act="payDebt" ${p.money < d.amount ? 'disabled' : ''}>Оплатить</button>
            ${assets}
            <button class="btn red" data-act="bankrupt">Банкрот</button>
          </div>`;
      }
      case 'end':
        return `${whose}<button class="btn huge yellow" data-act="endTurn">Завершить ход ➜</button><div class="row">${assets}${tradeBtn}</div>`;
      default:
        return '';
    }
  }

  private modalHtml(): string {
    if (!this.modal || !this.game) return '';
    const game = this.game;
    const s = game.state;
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
    } else if (this.modal === 'trade' && this.draft) {
      body = this.tradeHtml(this.draft);
    } else if (this.modal === 'assets') {
      const me = this.me();
      const owned = game.ownedBy(me);
      body = `<h3>Моё имущество</h3>
        ${owned.length ? '' : '<p>Пока ничего нет. Покупайте улицы!</p>'}
        <div class="asset-list">${owned
          .map((id) => {
            const c = BOARD[id];
            const own = s.cells[id];
            return `<button class="asset" data-cell="${id}">
              <span class="sw" style="background:${c.group ? GROUP_COLORS[c.group] : '#777'}"></span>
              <span class="an">${cellIcon(id, 'ico inline')} ${esc(c.name)}</span>
              <span class="ah">${own.mortgaged ? 'залог' : own.houses === 5 ? '🏨' : '🏠'.repeat(own.houses)}</span>
            </button>`;
          })
          .join('')}</div>
        <button class="btn blue" data-act="close">Закрыть</button>`;
    } else if (this.modal.startsWith('cell:')) {
      body = this.cellCard(Number(this.modal.slice(5)));
    }
    return `<div class="overlay"><div class="modal">${body}</div></div>`;
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
            btn('mortgage', 'Заложить', 'red'),
            btn('unmortgage', `Выкупить ${formatMoney(Game.unmortgageCost(c))}`, 'blue'),
          ].join('')
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
      <button class="btn ghost" data-act="close">Закрыть</button>`;
  }
}
