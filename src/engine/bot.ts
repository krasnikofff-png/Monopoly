import { BOARD, groupCells } from '../data/board';
import { Game } from './game';
import type { Action, ColorGroup, TradeOffer } from './types';

const RESERVE = 1500;
const GROUPS: ColorGroup[] = ['brown', 'lightblue', 'pink', 'orange', 'red', 'yellow', 'green', 'darkblue'];

type Owners = (number | null)[];

/** Условная «сила» владений игрока: стоимость клеток + бонус за монополии. */
function holdingsValue(game: Game, pid: number, owners: Owners): number {
  let v = 0;
  owners.forEach((o, id) => {
    if (o !== pid) return;
    const cell = BOARD[id];
    v += game.state.cells[id].mortgaged ? cell.price! / 2 : cell.price!;
  });
  return v + monopolyBonus(pid, owners);
}

function monopolyBonus(pid: number, owners: Owners): number {
  let bonus = 0;
  for (const g of GROUPS) {
    const ids = groupCells(g);
    if (ids.every((id) => owners[id] === pid)) bonus += ids.reduce((sum, id) => sum + BOARD[id].price!, 0) * 1.5;
  }
  const stations = owners.filter((o, id) => o === pid && BOARD[id].type === 'station').length;
  bonus += [0, 0, 500, 1500, 3000][stations];
  return bonus;
}

function applyTrade(owners: Owners, o: TradeOffer): Owners {
  const after = [...owners];
  for (const id of o.giveCells) after[id] = o.to;
  for (const id of o.getCells) after[id] = o.from;
  return after;
}

/** Чистая выгода от обмена для игрока pid (участника сделки). */
export function tradeGain(game: Game, pid: number, o: TradeOffer): number {
  const owners = game.state.cells.map((c) => c.owner);
  const after = applyTrade(owners, o);
  const other = pid === o.from ? o.to : o.from;
  const money = pid === o.from ? o.getMoney - o.giveMoney : o.giveMoney - o.getMoney;
  const mine = holdingsValue(game, pid, after) - holdingsValue(game, pid, owners) + money;
  const theirMonopolies = monopolyBonus(other, after) - monopolyBonus(other, owners);
  return mine - theirMonopolies * 0.8;
}

export function botAcceptsTrade(game: Game, pid: number, o: TradeOffer): boolean {
  return tradeGain(game, pid, o) > 0;
}

function groupFree(game: Game, group: ColorGroup): boolean {
  return groupCells(group).every((id) => game.state.cells[id].houses === 0);
}

/** Ищет выгодный обмен, который соберёт боту монополию. */
function findTrade(game: Game, pid: number): Action | null {
  const s = game.state;
  if (s.tradesThisTurn >= 1) return null;
  const me = game.player(pid);
  for (const g of GROUPS) {
    const ids = groupCells(g);
    const mineCount = ids.filter((id) => s.cells[id].owner === pid).length;
    if (mineCount === 0 || mineCount === ids.length || !groupFree(game, g)) continue;
    const missing = ids.filter((id) => s.cells[id].owner !== pid);
    const owners = new Set(missing.map((id) => s.cells[id].owner));
    if (owners.size !== 1 || owners.has(null)) continue;
    const partner = [...owners][0]!;
    if (game.player(partner).bankrupt) continue;

    // Что из моего поможет партнёру собрать его группу?
    const sweeteners: number[] = [];
    for (const pg of GROUPS) {
      if (pg === g || !groupFree(game, pg)) continue;
      const pids = groupCells(pg);
      const need = pids.filter((id) => s.cells[id].owner !== partner);
      if (need.length && need.every((id) => s.cells[id].owner === pid)) sweeteners.push(...need);
    }
    // Станции и службы — тоже хорошая разменная монета.
    const extras = game
      .ownedBy(pid)
      .filter((id) => !BOARD[id].group && !sweeteners.includes(id))
      .slice(0, 1);

    const budget = Math.max(0, me.money - RESERVE);
    const variants: number[][] = [sweeteners, extras, []];
    for (const give of variants) {
      for (let m = 0; m <= budget; m += 250) {
        const offer: TradeOffer = { from: pid, to: partner, giveCells: give, getCells: missing, giveMoney: m, getMoney: 0 };
        if (tradeGain(game, pid, offer) <= 0) break;
        // То же самое уже предлагали недавно — не повторяемся, а пробуем условия получше.
        if (game.recentlyOffered(offer)) continue;
        if (botAcceptsTrade(game, partner, offer)) {
          const { from: _from, ...rest } = offer;
          const action: Action = { type: 'proposeTrade', offer: rest };
          if (game.can(pid, action)) return action;
          break;
        }
      }
    }
  }
  return null;
}

/** Принесёт ли покупка клетки игроку полную группу (или станцию к уже имеющимся). */
function completesSet(game: Game, playerId: number, cellId: number): boolean {
  const cell = BOARD[cellId];
  if (!cell.group) return game.countOwned(playerId, cell.type as 'station' | 'utility') > 0;
  return groupCells(cell.group).every((id) => id === cellId || game.state.cells[id].owner === playerId);
}

/** Блокирует ли покупка чужую монополию. */
function blocksOpponent(game: Game, playerId: number, cellId: number): boolean {
  const cell = BOARD[cellId];
  if (!cell.group) return false;
  const others = groupCells(cell.group).filter((id) => id !== cellId);
  const owners = new Set(others.map((id) => game.state.cells[id].owner));
  return owners.size === 1 && !owners.has(null) && !owners.has(playerId);
}

function tryManage(game: Game, playerId: number): Action | null {
  const p = game.player(playerId);
  const trade = findTrade(game, playerId);
  if (trade) return trade;
  // Выкупаем заложенное, если денег много.
  for (const id of game.ownedBy(playerId)) {
    if (game.state.cells[id].mortgaged && p.money - Game.unmortgageCost(BOARD[id]) > RESERVE * 2) {
      const a: Action = { type: 'unmortgage', cell: id };
      if (game.can(playerId, a)) return a;
    }
  }
  // Строим на самых дорогих монополиях.
  const streets = game
    .ownedBy(playerId)
    .filter((id) => BOARD[id].type === 'property')
    .sort((a, b) => BOARD[b].price! - BOARD[a].price!);
  for (const id of streets) {
    if (p.money - BOARD[id].houseCost! < RESERVE) continue;
    const a: Action = { type: 'build', cell: id };
    if (game.can(playerId, a)) return a;
  }
  return null;
}

function raiseMoney(game: Game, playerId: number): Action | null {
  const owned = game.ownedBy(playerId);
  // 1. Продаём дома, начиная с самых застроенных.
  const built = owned
    .filter((id) => game.state.cells[id].houses > 0)
    .sort((a, b) => game.state.cells[b].houses - game.state.cells[a].houses);
  for (const id of built) {
    const a: Action = { type: 'sellHouse', cell: id };
    if (game.can(playerId, a)) return a;
  }
  // 2. Закладываем, начиная с дешёвых и не входящих в монополии.
  const mortgageable = owned
    .filter((id) => !game.state.cells[id].mortgaged)
    .sort((a, b) => {
      const ma = BOARD[a].group && game.ownsGroup(playerId, BOARD[a].group!) ? 1 : 0;
      const mb = BOARD[b].group && game.ownsGroup(playerId, BOARD[b].group!) ? 1 : 0;
      return ma - mb || BOARD[a].price! - BOARD[b].price!;
    });
  for (const id of mortgageable) {
    const a: Action = { type: 'mortgage', cell: id };
    if (game.can(playerId, a)) return a;
  }
  return null;
}

/** Решение бота. Возвращает null, если сейчас действует не этот игрок. */
export function botDecide(game: Game, playerId: number): Action | null {
  const s = game.state;
  if (game.actor() !== playerId || s.phase === 'gameover') return null;
  const p = game.player(playerId);

  switch (s.phase) {
    case 'roll': {
      const m = tryManage(game, playerId);
      if (m) return m;
      if (p.inJail) {
        if (p.jailFreeCards.length) return { type: 'useJailCard' };
        // В начале игры выгоднее выйти и скупать; позже — сидеть и собирать аренду.
        const unowned = s.cells.filter((c, i) => c.owner === null && BOARD[i].price).length;
        if (unowned > 8 && p.money > RESERVE + 500) return { type: 'payJail' };
      }
      return { type: 'roll' };
    }
    case 'buy': {
      const cell = BOARD[p.position];
      const price = cell.price!;
      const want =
        p.money - price >= RESERVE ||
        (p.money >= price && (completesSet(game, playerId, cell.id) || blocksOpponent(game, playerId, cell.id)));
      return want ? { type: 'buy' } : { type: 'decline' };
    }
    case 'auction': {
      const a = s.auction!;
      const cell = BOARD[a.cell];
      const factor = completesSet(game, playerId, cell.id) ? 1.4 : blocksOpponent(game, playerId, cell.id) ? 1.1 : 0.8;
      const limit = Math.min(Math.floor(cell.price! * factor), p.money - 500);
      const step = Math.max(10, Math.round(cell.price! / 200) * 10);
      const next = a.bid + step;
      return next <= limit ? { type: 'bid', amount: next } : { type: 'pass' };
    }
    case 'debt': {
      const debt = s.debts[0];
      if (p.money >= debt.amount) return { type: 'payDebt' };
      return raiseMoney(game, playerId) ?? { type: 'bankrupt' };
    }
    case 'trade':
      return botAcceptsTrade(game, playerId, s.trade!) ? { type: 'acceptTrade' } : { type: 'rejectTrade' };
    case 'end':
      return tryManage(game, playerId) ?? { type: 'endTurn' };
  }
  return null;
}
