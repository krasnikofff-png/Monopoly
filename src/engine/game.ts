import {
  BOARD,
  JAIL_CELL,
  JAIL_FINE,
  MAX_HOTELS,
  MAX_HOUSES,
  START_BONUS,
  START_MONEY,
  STATION_RENT,
  UTILITY_MULT,
  groupCells,
  isOwnable,
} from '../data/board';
import { CARDS, CARD_BY_ID } from '../data/cards';
import { nextRandom, randomSeed } from './rng';
import type {
  Action,
  Cell,
  ColorGroup,
  Deck,
  DeckId,
  GameEvent,
  GameState,
  Phase,
  Player,
  PlayerSetup,
  TradeOffer,
} from './types';

export class GameError extends Error {}

export const MAX_TRADES_PER_TURN = 5;

const DEFAULT_COLORS = ['#ff4d6d', '#3a86ff', '#2ec4b6', '#ffbe0b', '#9b5de5', '#fb5607'];
const DEFAULT_TOKENS = ['🚗', '🎩', '🐶', '🚀', '🐱', '⛵'];
const LOG_LIMIT = 200;

export function formatMoney(n: number): string {
  return `${n.toLocaleString('ru-RU')} ₽`;
}

export class Game {
  state: GameState;
  private events: GameEvent[] = [];
  /** Набор долгов, ожидающих оплаты (первый — активный). */
  private get debts() {
    return this.state.debts;
  }

  constructor(state: GameState) {
    this.state = state;
  }

  static create(setups: PlayerSetup[], seed: number = randomSeed()): Game {
    if (setups.length < 2 || setups.length > 6) throw new GameError('Нужно от 2 до 6 игроков');
    const players: Player[] = setups.map((s, i) => ({
      id: i,
      name: s.name,
      color: s.color ?? DEFAULT_COLORS[i],
      token: s.token ?? DEFAULT_TOKENS[i],
      isBot: s.isBot,
      money: START_MONEY,
      position: 0,
      inJail: false,
      jailTurns: 0,
      jailFreeCards: [],
      bankrupt: false,
    }));
    const state: GameState = {
      version: 1,
      players,
      cells: BOARD.map(() => ({ owner: null, houses: 0, mortgaged: false })),
      current: 0,
      phase: 'roll',
      dice: null,
      doublesCount: 0,
      extraRoll: false,
      auction: null,
      debts: [],
      debtResume: null,
      decks: {
        chance: { order: [], index: 0, held: [] },
        surprise: { order: [], index: 0, held: [] },
      },
      lastCard: null,
      trade: null,
      tradeResume: null,
      tradesThisTurn: 0,
      housesLeft: MAX_HOUSES,
      hotelsLeft: MAX_HOTELS,
      winner: null,
      turnNumber: 1,
      rngState: seed,
      log: [],
    };
    const game = new Game(state);
    game.shuffleDeck('chance');
    game.shuffleDeck('surprise');
    game.log(`Игра началась! Первым ходит ${players[0].name}.`);
    return game;
  }

  // ——————————————————— Публичный API ———————————————————

  /** Кто сейчас должен действовать. */
  actor(): number {
    const s = this.state;
    if (s.phase === 'auction' && s.auction) return s.auction.participants[s.auction.turn];
    if (s.phase === 'debt' && s.debts.length) return s.debts[0].debtor;
    if (s.phase === 'trade' && s.trade) return s.trade.to;
    return s.current;
  }

  drainEvents(): GameEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** Проверяет, допустимо ли действие (без изменения состояния). */
  can(playerId: number, action: Action): boolean {
    const copy = new Game(structuredClone(this.state));
    try {
      copy.dispatch(playerId, action);
      return true;
    } catch (e) {
      if (e instanceof GameError) return false;
      throw e;
    }
  }

  dispatch(playerId: number, action: Action): void {
    const s = this.state;
    if (s.phase === 'gameover') throw new GameError('Игра окончена');
    if (playerId !== this.actor()) throw new GameError('Сейчас не ваш ход');
    switch (action.type) {
      case 'roll':
        return this.roll();
      case 'buy':
        return this.buy();
      case 'decline':
        return this.decline();
      case 'bid':
        return this.bid(action.amount);
      case 'pass':
        return this.passAuction();
      case 'endTurn':
        return this.endTurn();
      case 'payJail':
        return this.payJail();
      case 'useJailCard':
        return this.useJailCard();
      case 'build':
        return this.build(playerId, action.cell);
      case 'sellHouse':
        return this.sellHouse(playerId, action.cell);
      case 'mortgage':
        return this.mortgage(playerId, action.cell);
      case 'unmortgage':
        return this.unmortgage(playerId, action.cell);
      case 'proposeTrade':
        return this.proposeTrade({ ...action.offer, from: playerId });
      case 'acceptTrade':
        return this.answerTrade(true);
      case 'rejectTrade':
        return this.answerTrade(false);
      case 'payDebt':
        return this.payDebt();
      case 'bankrupt':
        return this.declareBankruptcy();
    }
  }

  // ——————————————————— Запросы ———————————————————

  player(id: number): Player {
    return this.state.players[id];
  }

  ownsGroup(playerId: number, group: ColorGroup): boolean {
    return groupCells(group).every((id) => this.state.cells[id].owner === playerId);
  }

  countOwned(playerId: number, type: 'station' | 'utility'): number {
    return BOARD.filter((c) => c.type === type && this.state.cells[c.id].owner === playerId).length;
  }

  ownedBy(playerId: number): number[] {
    return BOARD.filter((c) => this.state.cells[c.id].owner === playerId).map((c) => c.id);
  }

  /** Аренда на клетке. diceSum нужен для коммунальных служб. */
  rentFor(cellId: number, diceSum: number, special: 'double' | 'utility10' | null = null): number {
    const cell = BOARD[cellId];
    const own = this.state.cells[cellId];
    if (own.owner === null || own.mortgaged) return 0;
    if (cell.type === 'property') {
      const rent = cell.rent!;
      if (own.houses > 0) return rent[own.houses];
      return this.ownsGroup(own.owner, cell.group!) ? rent[0] * 2 : rent[0];
    }
    if (cell.type === 'station') {
      const base = STATION_RENT[this.countOwned(own.owner, 'station') - 1];
      return special === 'double' ? base * 2 : base;
    }
    if (cell.type === 'utility') {
      if (special === 'utility10') return diceSum * 100;
      return diceSum * UTILITY_MULT[this.countOwned(own.owner, 'utility') - 1];
    }
    return 0;
  }

  /** Стоимость имущества при продаже банку (дома за полцены + залог). */
  liquidationValue(playerId: number): number {
    let total = this.player(playerId).money;
    for (const id of this.ownedBy(playerId)) {
      const cell = BOARD[id];
      const own = this.state.cells[id];
      if (own.houses > 0) total += (own.houses * cell.houseCost!) / 2;
      if (!own.mortgaged) total += cell.price! / 2;
    }
    return total;
  }

  netWorth(playerId: number): number {
    let total = this.player(playerId).money;
    for (const id of this.ownedBy(playerId)) {
      const cell = BOARD[id];
      const own = this.state.cells[id];
      total += own.mortgaged ? cell.price! / 2 : cell.price!;
      total += own.houses * (cell.houseCost ?? 0);
    }
    return total;
  }

  activePlayers(): Player[] {
    return this.state.players.filter((p) => !p.bankrupt);
  }

  // ——————————————————— Ход ———————————————————

  private roll(): void {
    const s = this.state;
    if (s.phase !== 'roll') throw new GameError('Сейчас нельзя бросать кубики');
    const p = this.player(s.current);
    const d1 = this.rollDie();
    const d2 = this.rollDie();
    const isDouble = d1 === d2;
    s.dice = [d1, d2];
    this.emit({ kind: 'dice', dice: [d1, d2] });
    this.log(`${p.name} выбрасывает ${d1} и ${d2}${isDouble ? ' — дубль!' : ''}.`);

    if (p.inJail) {
      s.extraRoll = false;
      if (isDouble) {
        p.inJail = false;
        p.jailTurns = 0;
        this.log(`${p.name} выходит из тюрьмы благодаря дублю.`);
      } else {
        p.jailTurns++;
        if (p.jailTurns < 3) {
          this.log(`${p.name} остаётся в тюрьме.`);
          this.finishAction();
          return;
        }
        this.log(`${p.name} отсидел три хода и платит штраф ${formatMoney(JAIL_FINE)}.`);
        p.inJail = false;
        p.jailTurns = 0;
        this.charge(p.id, null, JAIL_FINE);
      }
      this.moveBy(p.id, d1 + d2);
      this.finishAction();
      return;
    }

    if (isDouble) {
      s.doublesCount++;
      if (s.doublesCount >= 3) {
        this.log(`Три дубля подряд — ${p.name} отправляется в тюрьму!`);
        this.sendToJail(p.id);
        this.finishAction();
        return;
      }
    }
    s.extraRoll = isDouble;
    this.moveBy(p.id, d1 + d2);
    this.finishAction();
  }

  private endTurn(): void {
    const s = this.state;
    if (s.phase !== 'end') throw new GameError('Сначала завершите действия хода');
    this.nextPlayer();
  }

  private nextPlayer(): void {
    const s = this.state;
    if (s.phase === 'gameover') return;
    let next = s.current;
    do {
      next = (next + 1) % s.players.length;
    } while (s.players[next].bankrupt);
    s.current = next;
    s.phase = 'roll';
    s.dice = null;
    s.doublesCount = 0;
    s.extraRoll = false;
    s.lastCard = null;
    s.tradesThisTurn = 0;
    s.turnNumber++;
    this.log(`Ходит ${s.players[next].name}.`);
  }

  /** Определяет фазу после того, как ход разрешён. */
  private finishAction(): void {
    const s = this.state;
    if (s.phase === 'gameover') return;
    if (s.phase === 'buy' || s.phase === 'auction') {
      // Сначала решаем вопрос с покупкой; долги могут возникнуть позже.
      return;
    }
    const next = this.postMovePhase();
    if (s.debts.length) {
      s.debtResume = next;
      s.phase = 'debt';
    } else {
      s.phase = next;
      if (this.player(s.current).bankrupt) this.nextPlayer();
    }
  }

  private postMovePhase(): Phase {
    const s = this.state;
    const p = this.player(s.current);
    if (p.bankrupt) return 'end';
    return s.extraRoll && !p.inJail ? 'roll' : 'end';
  }

  // ——————————————————— Перемещение ———————————————————

  private moveBy(playerId: number, steps: number): void {
    const p = this.player(playerId);
    const from = p.position;
    const to = (((from + steps) % 40) + 40) % 40;
    if (steps > 0 && from + steps >= 40) this.passStart(playerId);
    p.position = to;
    this.emit({ kind: 'move', player: playerId, from, to, steps, direct: false });
    this.land(playerId, null);
  }

  private moveTo(playerId: number, cell: number, special: 'double' | 'utility10' | null = null): void {
    const p = this.player(playerId);
    const from = p.position;
    const steps = (cell - from + 40) % 40;
    if (cell < from || (cell === 0 && from !== 0)) this.passStart(playerId);
    p.position = cell;
    this.emit({ kind: 'move', player: playerId, from, to: cell, steps, direct: false });
    this.land(playerId, special);
  }

  private passStart(playerId: number): void {
    const p = this.player(playerId);
    this.addMoney(playerId, START_BONUS);
    this.log(`${p.name} проходит Старт и получает ${formatMoney(START_BONUS)}.`);
  }

  private sendToJail(playerId: number): void {
    const s = this.state;
    const p = this.player(playerId);
    const from = p.position;
    p.position = JAIL_CELL;
    p.inJail = true;
    p.jailTurns = 0;
    if (playerId === s.current) {
      s.extraRoll = false;
      s.doublesCount = 0;
    }
    this.emit({ kind: 'move', player: playerId, from, to: JAIL_CELL, steps: 0, direct: true });
    this.emit({ kind: 'jail', player: playerId });
  }

  // ——————————————————— Клетки ———————————————————

  private land(playerId: number, special: 'double' | 'utility10' | null): void {
    const s = this.state;
    const p = this.player(playerId);
    const cell = BOARD[p.position];

    if (isOwnable(cell)) {
      const own = s.cells[cell.id];
      if (own.owner === null) {
        s.phase = 'buy';
        this.log(`${p.name} попадает на «${cell.name}» — свободно за ${formatMoney(cell.price!)}.`);
        return;
      }
      if (own.owner === playerId) {
        this.log(`${p.name} на своей клетке «${cell.name}».`);
        return;
      }
      if (own.mortgaged) {
        this.log(`«${cell.name}» в залоге — аренда не взимается.`);
        return;
      }
      const sum = s.dice ? s.dice[0] + s.dice[1] : 7;
      const rent = this.rentFor(cell.id, sum, special);
      const owner = this.player(own.owner);
      this.log(`${p.name} платит ${owner.name} аренду ${formatMoney(rent)} за «${cell.name}».`);
      this.charge(playerId, own.owner, rent);
      return;
    }

    switch (cell.type) {
      case 'tax':
        this.log(`${p.name} платит «${cell.name}»: ${formatMoney(cell.amount!)}.`);
        this.charge(playerId, null, cell.amount!);
        return;
      case 'gotojail':
        this.log(`${p.name} отправляется в тюрьму!`);
        this.sendToJail(playerId);
        return;
      case 'chance':
      case 'surprise':
        this.drawCard(playerId, cell.type);
        return;
      case 'jail':
        this.log(`${p.name} навещает тюрьму — просто в гостях.`);
        return;
      case 'parking':
        this.log(`${p.name} отдыхает в Парке Горького.`);
        return;
      default:
        return;
    }
  }

  // ——————————————————— Карточки ———————————————————

  private shuffleDeck(deck: DeckId): void {
    const d: Deck = this.state.decks[deck];
    const ids = CARDS.filter((c) => c.deck === deck && !d.held.includes(c.id)).map((c) => c.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    d.order = ids;
    d.index = 0;
  }

  private drawCard(playerId: number, deckId: DeckId): void {
    const s = this.state;
    const deck = s.decks[deckId];
    if (deck.index >= deck.order.length) this.shuffleDeck(deckId);
    const card = CARD_BY_ID[deck.order[deck.index++]];
    const p = this.player(playerId);
    s.lastCard = card.id;
    this.emit({ kind: 'card', card: card.id });
    this.log(`${p.name} тянет «${deckId === 'chance' ? 'Шанс' : 'Сюрприз'}»: ${card.text}`);

    const e = card.effect;
    switch (e.kind) {
      case 'money':
        if (e.amount >= 0) this.addMoney(playerId, e.amount);
        else this.charge(playerId, null, -e.amount);
        return;
      case 'moveTo':
        this.moveTo(playerId, e.cell);
        return;
      case 'moveBy':
        this.moveBy(playerId, e.steps);
        return;
      case 'nearest': {
        let pos = p.position;
        do {
          pos = (pos + 1) % 40;
        } while (BOARD[pos].type !== e.target);
        this.moveTo(playerId, pos, e.target === 'station' ? 'double' : 'utility10');
        return;
      }
      case 'gotojail':
        this.sendToJail(playerId);
        return;
      case 'jailfree':
        deck.held.push(card.id);
        p.jailFreeCards.push(deckId);
        // Карточка уходит из колоды до использования.
        deck.order.splice(deck.index - 1, 1);
        deck.index--;
        return;
      case 'repairs': {
        let total = 0;
        for (const id of this.ownedBy(playerId)) {
          const h = s.cells[id].houses;
          total += h === 5 ? e.perHotel : h * e.perHouse;
        }
        if (total > 0) {
          this.log(`${p.name} платит за ремонт ${formatMoney(total)}.`);
          this.charge(playerId, null, total);
        }
        return;
      }
      case 'collectFromEach':
        for (const other of this.activePlayers()) {
          if (other.id !== playerId) this.charge(other.id, playerId, e.amount);
        }
        return;
      case 'payEach':
        for (const other of this.activePlayers()) {
          if (other.id !== playerId) this.charge(playerId, other.id, e.amount);
        }
        return;
    }
  }

  // ——————————————————— Деньги ———————————————————

  private addMoney(playerId: number, amount: number): void {
    if (amount === 0) return;
    this.player(playerId).money += amount;
    this.emit({ kind: 'money', player: playerId, delta: amount });
  }

  /** Списывает деньги; если их не хватает — создаёт долг. */
  private charge(debtor: number, creditor: number | null, amount: number): void {
    if (amount <= 0) return;
    const p = this.player(debtor);
    if (p.bankrupt) return;
    if (this.debts.length === 0 && p.money >= amount) {
      this.addMoney(debtor, -amount);
      if (creditor !== null) this.addMoney(creditor, amount);
      return;
    }
    this.debts.push({ debtor, creditor, amount });
    this.log(`${p.name} не хватает денег: долг ${formatMoney(amount)}.`);
  }

  private payDebt(): void {
    const s = this.state;
    if (s.phase !== 'debt' || !s.debts.length) throw new GameError('Нет долга');
    const debt = s.debts[0];
    const p = this.player(debt.debtor);
    if (p.money < debt.amount) throw new GameError('Недостаточно денег');
    this.addMoney(debt.debtor, -debt.amount);
    if (debt.creditor !== null) this.addMoney(debt.creditor, debt.amount);
    this.log(`${p.name} погашает долг ${formatMoney(debt.amount)}.`);
    s.debts.shift();
    this.resolveDebts();
  }

  /** Автоматически оплачивает следующие долги, если денег хватает. */
  private resolveDebts(): void {
    const s = this.state;
    while (s.debts.length) {
      const d = s.debts[0];
      const p = this.player(d.debtor);
      if (p.bankrupt) {
        s.debts.shift();
        continue;
      }
      if (p.money >= d.amount) {
        this.addMoney(d.debtor, -d.amount);
        if (d.creditor !== null) this.addMoney(d.creditor, d.amount);
        s.debts.shift();
        continue;
      }
      s.phase = 'debt';
      return;
    }
    if (s.phase === 'gameover') return;
    const resume = s.debtResume ?? 'end';
    s.debtResume = null;
    s.phase = resume;
    if (this.player(s.current).bankrupt) this.nextPlayer();
  }

  private declareBankruptcy(): void {
    const s = this.state;
    if (s.phase !== 'debt' || !s.debts.length) throw new GameError('Банкротство возможно только при долге');
    const debt = s.debts.shift()!;
    const p = this.player(debt.debtor);
    const creditor = debt.creditor === null ? null : this.player(debt.creditor);

    // Дома продаются банку за полцены.
    for (const id of this.ownedBy(p.id)) {
      const own = s.cells[id];
      if (own.houses > 0) {
        p.money += (own.houses * BOARD[id].houseCost!) / 2;
        this.returnBuildings(own.houses);
        own.houses = 0;
      }
    }
    for (const id of this.ownedBy(p.id)) {
      const own = s.cells[id];
      if (creditor) {
        own.owner = creditor.id;
      } else {
        own.owner = null;
        own.mortgaged = false;
      }
    }
    if (creditor) {
      if (p.money > 0) this.addMoney(creditor.id, p.money);
      creditor.jailFreeCards.push(...p.jailFreeCards);
    } else {
      for (const deckId of p.jailFreeCards) {
        const d = s.decks[deckId];
        const cardId = d.held.find((id) => CARD_BY_ID[id].deck === deckId);
        if (cardId) {
          d.held.splice(d.held.indexOf(cardId), 1);
          d.order.push(cardId);
        }
      }
    }
    p.money = 0;
    p.jailFreeCards = [];
    p.bankrupt = true;
    p.inJail = false;
    this.emit({ kind: 'bankrupt', player: p.id });
    this.log(`${p.name} — банкрот!${creditor ? ` Всё имущество переходит к ${creditor.name}.` : ''}`);

    const alive = this.activePlayers();
    if (alive.length <= 1) {
      s.phase = 'gameover';
      s.winner = alive[0]?.id ?? null;
      s.debts = [];
      this.emit({ kind: 'gameover', winner: s.winner });
      this.log(`Игра окончена! Победитель — ${alive[0]?.name ?? 'никто'}.`);
      return;
    }
    this.resolveDebts();
  }

  // ——————————————————— Тюрьма ———————————————————

  private payJail(): void {
    const s = this.state;
    const p = this.player(s.current);
    if (s.phase !== 'roll' || !p.inJail) throw new GameError('Вы не в тюрьме');
    if (p.money < JAIL_FINE) throw new GameError('Недостаточно денег');
    this.addMoney(p.id, -JAIL_FINE);
    p.inJail = false;
    p.jailTurns = 0;
    this.log(`${p.name} платит ${formatMoney(JAIL_FINE)} и выходит из тюрьмы.`);
  }

  private useJailCard(): void {
    const s = this.state;
    const p = this.player(s.current);
    if (s.phase !== 'roll' || !p.inJail) throw new GameError('Вы не в тюрьме');
    const deckId = p.jailFreeCards.shift();
    if (!deckId) throw new GameError('Нет карточки');
    const d = s.decks[deckId];
    const cardId = d.held.find((id) => CARD_BY_ID[id].deck === deckId);
    if (cardId) {
      d.held.splice(d.held.indexOf(cardId), 1);
      d.order.push(cardId); // кладём под низ колоды
    }
    p.inJail = false;
    p.jailTurns = 0;
    this.log(`${p.name} использует карточку и выходит из тюрьмы.`);
  }

  // ——————————————————— Покупка и аукцион ———————————————————

  private buy(): void {
    const s = this.state;
    if (s.phase !== 'buy') throw new GameError('Нечего покупать');
    const p = this.player(s.current);
    const cell = BOARD[p.position];
    if (p.money < cell.price!) throw new GameError('Недостаточно денег');
    this.addMoney(p.id, -cell.price!);
    s.cells[cell.id].owner = p.id;
    this.emit({ kind: 'buy', player: p.id, cell: cell.id });
    this.log(`${p.name} покупает «${cell.name}» за ${formatMoney(cell.price!)}.`);
    s.phase = 'end'; // временно, finishAction вычислит правильно
    this.finishAction();
  }

  private decline(): void {
    const s = this.state;
    if (s.phase !== 'buy') throw new GameError('Нечего отклонять');
    const cellId = this.player(s.current).position;
    const order: number[] = [];
    for (let i = 0; i < s.players.length; i++) {
      const id = (s.current + i) % s.players.length;
      if (!s.players[id].bankrupt) order.push(id);
    }
    s.auction = { cell: cellId, bid: 0, bidder: null, participants: order, turn: 0 };
    s.phase = 'auction';
    this.log(`Аукцион: «${BOARD[cellId].name}».`);
  }

  private bid(amount: number): void {
    const s = this.state;
    const a = s.auction;
    if (s.phase !== 'auction' || !a) throw new GameError('Аукциона нет');
    const p = this.player(this.actor());
    if (!Number.isInteger(amount) || amount <= a.bid || amount < 10) throw new GameError('Ставка должна быть выше');
    if (amount > p.money) throw new GameError('Недостаточно денег');
    a.bid = amount;
    a.bidder = p.id;
    this.log(`${p.name} ставит ${formatMoney(amount)}.`);
    this.advanceAuction(false);
  }

  private passAuction(): void {
    const s = this.state;
    const a = s.auction;
    if (s.phase !== 'auction' || !a) throw new GameError('Аукциона нет');
    const p = this.player(this.actor());
    this.log(`${p.name} пасует.`);
    a.participants.splice(a.turn, 1);
    this.advanceAuction(true);
  }

  private advanceAuction(removed: boolean): void {
    const s = this.state;
    const a = s.auction!;
    const n = a.participants.length;
    const done = n === 0 || (n === 1 && a.bidder === a.participants[0]);
    if (done) {
      const cell = BOARD[a.cell];
      if (a.bidder !== null) {
        this.addMoney(a.bidder, -a.bid);
        s.cells[a.cell].owner = a.bidder;
        this.emit({ kind: 'buy', player: a.bidder, cell: a.cell });
        this.log(`${this.player(a.bidder).name} выигрывает аукцион: «${cell.name}» за ${formatMoney(a.bid)}.`);
      } else {
        this.log(`Никто не купил «${cell.name}».`);
      }
      s.auction = null;
      s.phase = 'end';
      this.finishAction();
      return;
    }
    if (!removed) a.turn = (a.turn + 1) % n;
    else a.turn = a.turn % n;
    // Лидер торгов не делает ставку сам против себя.
    if (a.participants[a.turn] === a.bidder) a.turn = (a.turn + 1) % n;
  }

  // ——————————————————— Обмен ———————————————————

  private validateTrade(o: TradeOffer): void {
    const s = this.state;
    const from = s.players[o.from];
    const to = s.players[o.to];
    if (!to || to.bankrupt || o.to === o.from) throw new GameError('Неверный партнёр');
    const money = [o.giveMoney, o.getMoney];
    if (money.some((m) => !Number.isInteger(m) || m < 0)) throw new GameError('Неверная сумма');
    if (o.giveMoney > from.money) throw new GameError('У вас нет столько денег');
    if (o.getMoney > to.money) throw new GameError('У партнёра нет столько денег');
    if (new Set([...o.giveCells, ...o.getCells]).size !== o.giveCells.length + o.getCells.length) {
      throw new GameError('Повторяющиеся клетки');
    }
    if (!o.giveCells.length && !o.getCells.length) throw new GameError('Пустое предложение');
    const check = (cells: number[], owner: number) => {
      for (const id of cells) {
        const cell = BOARD[id];
        if (!cell || s.cells[id].owner !== owner) throw new GameError('Клетка принадлежит другому');
        if (cell.group && groupCells(cell.group).some((g) => s.cells[g].houses > 0)) {
          throw new GameError('Сначала продайте постройки в группе');
        }
      }
    };
    check(o.giveCells, o.from);
    check(o.getCells, o.to);
  }

  private proposeTrade(o: TradeOffer): void {
    const s = this.state;
    if (s.phase !== 'roll' && s.phase !== 'end') throw new GameError('Сейчас нельзя меняться');
    if (s.tradesThisTurn >= MAX_TRADES_PER_TURN) throw new GameError('Слишком много предложений за ход');
    this.validateTrade(o);
    s.trade = { ...o, giveCells: [...o.giveCells], getCells: [...o.getCells] };
    s.tradeResume = s.phase;
    s.tradesThisTurn++;
    s.phase = 'trade';
    this.log(`${this.player(o.from).name} предлагает обмен игроку ${this.player(o.to).name}.`);
  }

  private answerTrade(accept: boolean): void {
    const s = this.state;
    const o = s.trade;
    if (s.phase !== 'trade' || !o) throw new GameError('Нет предложения');
    if (accept) {
      this.validateTrade(o);
      for (const id of o.giveCells) s.cells[id].owner = o.to;
      for (const id of o.getCells) s.cells[id].owner = o.from;
      if (o.giveMoney) {
        this.addMoney(o.from, -o.giveMoney);
        this.addMoney(o.to, o.giveMoney);
      }
      if (o.getMoney) {
        this.addMoney(o.to, -o.getMoney);
        this.addMoney(o.from, o.getMoney);
      }
    }
    this.emit({ kind: 'trade', offer: o, accepted: accept });
    this.log(`${this.player(o.to).name} ${accept ? 'принимает' : 'отклоняет'} обмен.`);
    s.phase = s.tradeResume ?? 'end';
    s.trade = null;
    s.tradeResume = null;
  }

  // ——————————————————— Строительство и залог ———————————————————

  private assertManage(playerId: number, allowDebt: boolean): void {
    const s = this.state;
    const ok = s.phase === 'roll' || s.phase === 'end' || (allowDebt && s.phase === 'debt');
    if (!ok) throw new GameError('Сейчас нельзя управлять имуществом');
    if (s.phase !== 'debt' && playerId !== s.current) throw new GameError('Не ваш ход');
  }

  private streetOf(playerId: number, cellId: number): Cell {
    const cell = BOARD[cellId];
    if (!cell || cell.type !== 'property') throw new GameError('Это не улица');
    if (this.state.cells[cellId].owner !== playerId) throw new GameError('Это не ваша улица');
    return cell;
  }

  private build(playerId: number, cellId: number): void {
    this.assertManage(playerId, false);
    const s = this.state;
    const cell = this.streetOf(playerId, cellId);
    const group = groupCells(cell.group!);
    if (!this.ownsGroup(playerId, cell.group!)) throw new GameError('Нужна вся цветовая группа');
    if (group.some((id) => s.cells[id].mortgaged)) throw new GameError('В группе есть заложенные улицы');
    const own = s.cells[cellId];
    if (own.houses >= 5) throw new GameError('Уже стоит отель');
    const min = Math.min(...group.map((id) => s.cells[id].houses));
    if (own.houses > min) throw new GameError('Стройте равномерно');
    const p = this.player(playerId);
    if (p.money < cell.houseCost!) throw new GameError('Недостаточно денег');
    if (own.houses === 4) {
      if (s.hotelsLeft <= 0) throw new GameError('В банке нет отелей');
      s.hotelsLeft--;
      s.housesLeft += 4;
    } else {
      if (s.housesLeft <= 0) throw new GameError('В банке нет домов');
      s.housesLeft--;
    }
    own.houses++;
    this.addMoney(playerId, -cell.houseCost!);
    this.emit({ kind: 'build', cell: cellId, houses: own.houses });
    this.log(`${p.name} строит ${own.houses === 5 ? 'отель' : 'дом'} на «${cell.name}».`);
  }

  private sellHouse(playerId: number, cellId: number): void {
    this.assertManage(playerId, true);
    const s = this.state;
    const cell = this.streetOf(playerId, cellId);
    const own = s.cells[cellId];
    if (own.houses === 0) throw new GameError('Здесь нет построек');
    const group = groupCells(cell.group!);
    const max = Math.max(...group.map((id) => s.cells[id].houses));
    if (own.houses < max) throw new GameError('Продавайте равномерно');
    let sold = 1;
    if (own.houses === 5) {
      s.hotelsLeft++;
      const back = Math.min(4, s.housesLeft);
      s.housesLeft -= back;
      sold = 5 - back;
      own.houses = back;
    } else {
      s.housesLeft++;
      own.houses--;
    }
    const refund = (sold * cell.houseCost!) / 2;
    this.addMoney(playerId, refund);
    this.emit({ kind: 'build', cell: cellId, houses: own.houses });
    this.log(`${this.player(playerId).name} продаёт постройку на «${cell.name}» за ${formatMoney(refund)}.`);
  }

  private returnBuildings(houses: number): void {
    if (houses === 5) this.state.hotelsLeft++;
    else this.state.housesLeft += houses;
  }

  private mortgage(playerId: number, cellId: number): void {
    this.assertManage(playerId, true);
    const s = this.state;
    const cell = BOARD[cellId];
    const own = s.cells[cellId];
    if (!cell || !isOwnable(cell) || own.owner !== playerId) throw new GameError('Это не ваше');
    if (own.mortgaged) throw new GameError('Уже в залоге');
    if (cell.group && groupCells(cell.group).some((id) => s.cells[id].houses > 0)) {
      throw new GameError('Сначала продайте постройки в группе');
    }
    own.mortgaged = true;
    this.addMoney(playerId, cell.price! / 2);
    this.log(`${this.player(playerId).name} закладывает «${cell.name}» за ${formatMoney(cell.price! / 2)}.`);
  }

  static unmortgageCost(cell: Cell): number {
    return Math.ceil((cell.price! * 0.55) / 10) * 10;
  }

  private unmortgage(playerId: number, cellId: number): void {
    this.assertManage(playerId, false);
    const cell = BOARD[cellId];
    const own = this.state.cells[cellId];
    if (!cell || !isOwnable(cell) || own.owner !== playerId) throw new GameError('Это не ваше');
    if (!own.mortgaged) throw new GameError('Не в залоге');
    const cost = Game.unmortgageCost(cell);
    if (this.player(playerId).money < cost) throw new GameError('Недостаточно денег');
    own.mortgaged = false;
    this.addMoney(playerId, -cost);
    this.log(`${this.player(playerId).name} выкупает «${cell.name}» за ${formatMoney(cost)}.`);
  }

  // ——————————————————— Служебное ———————————————————

  private random(): number {
    const [v, next] = nextRandom(this.state.rngState);
    this.state.rngState = next;
    return v;
  }

  private rollDie(): number {
    return 1 + Math.floor(this.random() * 6);
  }

  private emit(e: GameEvent): void {
    this.events.push(e);
  }

  private log(msg: string): void {
    const log = this.state.log;
    log.push(msg);
    if (log.length > LOG_LIMIT) log.splice(0, log.length - LOG_LIMIT);
  }
}
