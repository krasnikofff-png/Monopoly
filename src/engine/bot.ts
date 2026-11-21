import { BOARD, JAIL_FINE, groupCells } from '../data/board';
import { Game } from './game';
import { GROUP_TRAFFIC, getPersona, type Persona } from './personas';
import type { Action, ColorGroup, TradeOffer } from './types';

const GROUPS: ColorGroup[] = ['brown', 'lightblue', 'pink', 'orange', 'red', 'yellow', 'green', 'darkblue'];

type Owners = (number | null)[];

export function personaOf(game: Game, pid: number): Persona {
  return getPersona(game.player(pid).style);
}

/**
 * «Случайность» бота: зависит только от состояния партии, поэтому одинаковая при проверке
 * действия и при его выполнении, при откате хода и повторе.
 */
function chance(game: Game, pid: number, salt: number): number {
  let h = (game.state.rngState ^ Math.imul(pid + 1, 0x9e3779b1) ^ Math.imul(salt + 7, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Ценность клетки для бота: цена, а для знатока — с поправкой на то, как часто на неё встают. */
function cellWorth(id: number, ps: Persona): number {
  const cell = BOARD[id];
  return cell.price! * (ps.landingAware && cell.group ? GROUP_TRAFFIC[cell.group] : 1);
}

/** Условная «сила» владений игрока: стоимость клеток + бонус за монополии. */
function holdingsValue(game: Game, pid: number, owners: Owners, ps: Persona): number {
  let v = 0;
  owners.forEach((o, id) => {
    if (o !== pid) return;
    v += game.state.cells[id].mortgaged ? cellWorth(id, ps) / 2 : cellWorth(id, ps);
  });
  return v + monopolyBonus(pid, owners, ps);
}

function monopolyBonus(pid: number, owners: Owners, ps: Persona): number {
  let bonus = 0;
  for (const g of GROUPS) {
    const ids = groupCells(g);
    if (ids.every((id) => owners[id] === pid)) bonus += ids.reduce((sum, id) => sum + cellWorth(id, ps), 0) * 1.5;
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

/** Чистая выгода от обмена для игрока pid (участника сделки) — по меркам его характера. */
export function tradeGain(game: Game, pid: number, o: TradeOffer, ps: Persona = personaOf(game, pid)): number {
  const owners = game.state.cells.map((c) => c.owner);
  const after = applyTrade(owners, o);
  const other = pid === o.from ? o.to : o.from;
  const money = pid === o.from ? o.getMoney - o.giveMoney : o.giveMoney - o.getMoney;
  const mine = holdingsValue(game, pid, after, ps) - holdingsValue(game, pid, owners, ps) + money;
  const theirMonopolies = monopolyBonus(other, after, ps) - monopolyBonus(other, owners, ps);
  return mine - theirMonopolies * ps.theirWeight;
}

export function botAcceptsTrade(game: Game, pid: number, o: TradeOffer): boolean {
  const ps = personaOf(game, pid);
  const mood = ps.noise ? (chance(game, pid, 11) * 2 - 1) * ps.noise * 2000 : 0;
  return tradeGain(game, pid, o, ps) > ps.acceptMargin + mood;
}

function groupFree(game: Game, group: ColorGroup): boolean {
  return groupCells(group).every((id) => game.state.cells[id].houses === 0);
}

/** Согласится ли партнёр — как это видит бот (о людях судит по «среднему» игроку). */
function partnerLikes(game: Game, partner: number, o: TradeOffer, lowball: number): boolean {
  const p = game.player(partner);
  if (!p.isBot) return tradeGain(game, partner, o, getPersona(undefined)) > -lowball;
  return botAcceptsTrade(game, partner, o) || (lowball > 0 && tradeGain(game, partner, o) > -lowball);
}

/** Ищет обмен, который соберёт боту монополию. */
function findTrade(game: Game, pid: number, ps: Persona): Action | null {
  const s = game.state;
  if (s.tradesThisTurn >= ps.trades) return null;
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

    const budget = Math.max(0, me.money - ps.reserve);
    const variants: number[][] = [sweeteners, extras, []];
    for (const give of variants) {
      for (let m = 0; m <= budget; m += 250) {
        const offer: TradeOffer = { from: pid, to: partner, giveCells: give, getCells: missing, giveMoney: m, getMoney: 0 };
        if (tradeGain(game, pid, offer, ps) <= 0) break;
        // После отказа — только лучше для партнёра: больше денег или больше улиц.
        if (!game.canReoffer(offer)) continue;
        if (!partnerLikes(game, partner, offer, ps.lowball)) continue;
        // Щедрый бот доплачивает сверху, чтобы сделка точно прошла.
        if (ps.overpay) {
          const extra = Math.min(ps.overpay, budget - m);
          const rich = { ...offer, giveMoney: m + Math.max(0, extra) };
          if (tradeGain(game, pid, rich, ps) > 0) offer.giveMoney = rich.giveMoney;
        }
        const { from: _from, ...rest } = offer;
        const action: Action = { type: 'proposeTrade', offer: rest };
        if (game.can(pid, action)) return action;
        break;
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

/** Насколько выгодно поставить следующий дом: прирост аренды на рубль вложений. */
function buildValue(game: Game, id: number, ps: Persona): number {
  const cell = BOARD[id];
  const h = game.state.cells[id].houses;
  const gain = cell.rent![h + 1] - cell.rent![h];
  return (gain / cell.houseCost!) * (ps.landingAware ? GROUP_TRAFFIC[cell.group!] : 1);
}

function tryManage(game: Game, playerId: number, ps: Persona): Action | null {
  const s = game.state;
  const p = game.player(playerId);
  const trade = findTrade(game, playerId, ps);
  if (trade) return trade;
  // Выкупаем заложенное, если денег много.
  for (const id of game.ownedBy(playerId)) {
    if (s.cells[id].mortgaged && p.money - Game.unmortgageCost(BOARD[id]) > ps.unmortgageReserve) {
      const a: Action = { type: 'unmortgage', cell: id };
      if (game.can(playerId, a)) return a;
    }
  }
  const streets = game.ownedBy(playerId).filter((id) => BOARD[id].type === 'property');
  if (ps.buildOrder === 'expensive') streets.sort((a, b) => BOARD[b].price! - BOARD[a].price!);
  else if (ps.buildOrder === 'cheap') streets.sort((a, b) => BOARD[a].price! - BOARD[b].price!);
  else streets.sort((a, b) => buildValue(game, b, ps) - buildValue(game, a, ps));
  for (const id of streets) {
    const h = s.cells[id].houses;
    if (h >= ps.maxHouses) continue;
    if (p.money - BOARD[id].houseCost! < ps.buildReserve) continue;
    // Придерживает дома: пока в банке их мало, отели не ставит — пусть соперникам не достанется.
    if (ps.hoard && h === 4 && !s.rules?.unlimitedHouses && s.housesLeft <= 12) continue;
    if (ps.noise && chance(game, playerId, 100 + id) < ps.noise / 2) continue;
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

/** Выйти из тюрьмы сразу (картой или штрафом) или пробовать выбросить дубль. */
function leaveJail(game: Game, playerId: number, ps: Persona): boolean {
  const s = game.state;
  const p = game.player(playerId);
  const unowned = s.cells.filter((c, i) => c.owner === null && BOARD[i].price).length;
  switch (ps.jail) {
    case 'always':
      return true;
    case 'never':
      return false;
    case 'early':
      return unowned > 8 && p.money > ps.reserve + 500;
    case 'smart':
      // В начале — выйти и скупать; потом — сидеть и собирать аренду, даже с картой на руках.
      return unowned > 6 && p.money > ps.reserve;
    case 'random':
      return chance(game, playerId, 5) < 0.5;
  }
}

/** Решение бота. Возвращает null, если сейчас действует не этот игрок. */
export function botDecide(game: Game, playerId: number): Action | null {
  const s = game.state;
  if (game.actor() !== playerId || s.phase === 'gameover') return null;
  const p = game.player(playerId);
  const ps = personaOf(game, playerId);

  switch (s.phase) {
    case 'roll': {
      const m = tryManage(game, playerId, ps);
      if (m) return m;
      if (p.inJail && leaveJail(game, playerId, ps)) {
        if (p.jailFreeCards.length) return { type: 'useJailCard' };
        if (p.money >= JAIL_FINE + 200) return { type: 'payJail' };
      }
      return { type: 'roll' };
    }
    case 'buy': {
      const cell = BOARD[p.position];
      const price = cell.price!;
      if (p.money < price) return { type: 'decline' };
      const key = completesSet(game, playerId, cell.id) || (ps.theirWeight > 0 && blocksOpponent(game, playerId, cell.id));
      // Знаток бережёт меньший запас ради «ходовых» улиц.
      const traffic = ps.landingAware && cell.group ? GROUP_TRAFFIC[cell.group] : 1;
      const comfy = p.money - price >= ps.reserve / (traffic * traffic);
      let want: boolean;
      if (ps.buy === 'all') want = true;
      else if (ps.buy === 'smart') want = comfy || key;
      else want = key || chance(game, playerId, 1) < (comfy ? 0.85 : 0.3);
      return want ? { type: 'buy' } : { type: 'decline' };
    }
    case 'auction': {
      const a = s.auction!;
      const cell = BOARD[a.cell];
      let factor = completesSet(game, playerId, cell.id)
        ? ps.auction[2]
        : ps.theirWeight > 0 && blocksOpponent(game, playerId, cell.id)
          ? ps.auction[1]
          : ps.auction[0];
      if (ps.landingAware && cell.group) factor *= GROUP_TRAFFIC[cell.group];
      if (ps.noise) factor *= 1 + (chance(game, playerId, 3 + a.cell) * 2 - 1) * ps.noise;
      const limit = Math.min(Math.floor(cell.price! * factor), p.money - Math.min(500, ps.reserve));
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
      return tryManage(game, playerId, ps) ?? { type: 'endTurn' };
  }
  return null;
}
