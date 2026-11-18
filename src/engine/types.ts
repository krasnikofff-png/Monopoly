// Общие типы игрового движка.

export type ColorGroup =
  | 'brown'
  | 'lightblue'
  | 'pink'
  | 'orange'
  | 'red'
  | 'yellow'
  | 'green'
  | 'darkblue';

export type CellType =
  | 'start'
  | 'property'
  | 'station'
  | 'utility'
  | 'tax'
  | 'chance'
  | 'surprise'
  | 'jail'
  | 'parking'
  | 'gotojail';

export interface Cell {
  id: number;
  type: CellType;
  name: string;
  /** Короткая подпись для маленьких клеток. */
  short?: string;
  group?: ColorGroup;
  price?: number;
  /** Аренда: [без домов, 1, 2, 3, 4 дома, отель]. Только для улиц. */
  rent?: number[];
  houseCost?: number;
  /** Сумма налога. */
  amount?: number;
}

export type DeckId = 'chance' | 'surprise';

export type CardEffect =
  | { kind: 'money'; amount: number }
  | { kind: 'moveTo'; cell: number }
  | { kind: 'moveBy'; steps: number }
  | { kind: 'nearest'; target: 'station' | 'utility' }
  | { kind: 'gotojail' }
  | { kind: 'jailfree' }
  | { kind: 'repairs'; perHouse: number; perHotel: number }
  | { kind: 'collectFromEach'; amount: number }
  | { kind: 'payEach'; amount: number };

export interface Card {
  id: string;
  deck: DeckId;
  text: string;
  effect: CardEffect;
}

export interface Player {
  id: number;
  name: string;
  color: string;
  token: string;
  isBot: boolean;
  money: number;
  position: number;
  inJail: boolean;
  jailTurns: number;
  /** Колоды, из которых у игрока есть карточка «Выйти из тюрьмы». */
  jailFreeCards: DeckId[];
  bankrupt: boolean;
}

export interface OwnedCell {
  owner: number | null;
  /** 0–4 дома, 5 = отель. */
  houses: number;
  mortgaged: boolean;
}

export type Phase =
  | 'roll' // текущий игрок бросает кубики (или решает, как выйти из тюрьмы)
  | 'buy' // решение о покупке свободного участка
  | 'auction' // идёт аукцион
  | 'debt' // игрок должен найти деньги
  | 'trade' // другой игрок рассматривает предложение обмена
  | 'end' // ход сделан, можно управлять имуществом и завершить ход
  | 'gameover';

export interface Auction {
  cell: number;
  bid: number;
  bidder: number | null;
  /** Игроки, ещё участвующие в торгах, в порядке хода. */
  participants: number[];
  /** Индекс в participants того, кто сейчас делает ставку. */
  turn: number;
}

export interface Debt {
  debtor: number;
  creditor: number | null; // null = банк
  amount: number;
}

export interface TradeOffer {
  from: number;
  to: number;
  giveCells: number[];
  getCells: number[];
  giveMoney: number;
  getMoney: number;
}

export interface Deck {
  order: string[]; // id карточек
  index: number;
  /** Карточки «Выйти из тюрьмы», которые сейчас на руках у игроков. */
  held: string[];
}

export interface GameState {
  version: 1;
  players: Player[];
  cells: OwnedCell[];
  current: number;
  phase: Phase;
  dice: [number, number] | null;
  doublesCount: number;
  /** Выпал дубль — после хода игрок бросает ещё раз. */
  extraRoll: boolean;
  auction: Auction | null;
  /** Очередь долгов; первый — активный. */
  debts: Debt[];
  /** Фаза, в которую вернуться после погашения всех долгов. */
  debtResume: Phase | null;
  decks: Record<DeckId, Deck>;
  /** Последняя вытянутая карточка (для показа). */
  lastCard: string | null;
  trade: TradeOffer | null;
  tradeResume: Phase | null;
  tradesThisTurn: number;
  housesLeft: number;
  hotelsLeft: number;
  winner: number | null;
  turnNumber: number;
  rngState: number;
  /** Домашние правила партии. */
  rules?: { unlimitedHouses?: boolean };
  log: string[];
}

export type Action =
  | { type: 'roll' }
  | { type: 'buy' }
  | { type: 'decline' }
  | { type: 'bid'; amount: number }
  | { type: 'pass' }
  | { type: 'endTurn' }
  | { type: 'payJail' }
  | { type: 'useJailCard' }
  | { type: 'build'; cell: number }
  | { type: 'sellHouse'; cell: number }
  | { type: 'mortgage'; cell: number }
  | { type: 'unmortgage'; cell: number }
  | { type: 'proposeTrade'; offer: Omit<TradeOffer, 'from'> }
  | { type: 'transfer'; to: number; amount: number }
  | { type: 'acceptTrade' }
  | { type: 'rejectTrade' }
  | { type: 'payDebt' }
  | { type: 'bankrupt' };

export type GameEvent =
  | { kind: 'dice'; dice: [number, number] }
  | { kind: 'move'; player: number; from: number; to: number; steps: number; direct: boolean }
  | { kind: 'money'; player: number; delta: number }
  | { kind: 'card'; card: string }
  | { kind: 'jail'; player: number }
  | { kind: 'buy'; player: number; cell: number; price: number; auction: boolean }
  | {
      kind: 'notice';
      /** pay — кто-то платит, gain — получает, bad — неприятность, info — просто событие */
      tone: 'pay' | 'gain' | 'bad' | 'info';
      title: string;
      text: string;
      amount?: number;
      cell?: number;
      from?: number | null;
      to?: number | null;
    }
  | { kind: 'build'; cell: number; houses: number }
  | { kind: 'trade'; offer: TradeOffer; accepted: boolean }
  | { kind: 'bankrupt'; player: number }
  | { kind: 'gameover'; winner: number | null };

export interface PlayerSetup {
  name: string;
  isBot: boolean;
  color?: string;
  token?: string;
}
