import { describe, expect, it } from 'vitest';
import { BOARD, START_BONUS, START_MONEY } from '../src/data/board';
import { botDecide } from '../src/engine/bot';
import { PERSONAS } from '../src/engine/personas';
import { Game } from '../src/engine/game';
import { restoredDavidYana } from '../src/ui/restore';
import { exportCode, importCode } from '../src/ui/store';

function twoPlayers(seed = 1) {
  return Game.create(
    [
      { name: 'Аня', isBot: false },
      { name: 'Боря', isBot: true },
    ],
    seed,
  );
}

/** Подкручивает ГСЧ так, чтобы следующий бросок дал нужные кубики. */
function forceDice(game: Game, d1: number, d2: number) {
  const s = game.state;
  for (let seed = 0; seed < 1_000_000; seed++) {
    const copy = new Game(structuredClone({ ...s, rngState: seed, phase: 'roll' as const }));
    copy.dispatch(s.current, { type: 'roll' });
    const d = copy.state.dice!;
    if (d[0] === d1 && d[1] === d2) {
      s.rngState = seed;
      return;
    }
  }
  throw new Error('seed not found');
}

describe('Игровой движок', () => {
  it('создаёт игру со стартовыми деньгами', () => {
    const g = twoPlayers();
    expect(g.state.players.map((p) => p.money)).toEqual([START_MONEY, START_MONEY]);
    expect(BOARD).toHaveLength(40);
    expect(g.actor()).toBe(0);
  });

  it('ход, покупка и аренда', () => {
    const g = twoPlayers();
    forceDice(g, 1, 2); // на клетку 3 — Бирюлёво
    g.dispatch(0, { type: 'roll' });
    expect(g.state.players[0].position).toBe(3);
    expect(g.state.phase).toBe('buy');
    g.dispatch(0, { type: 'buy' });
    expect(g.state.cells[3].owner).toBe(0);
    expect(g.state.players[0].money).toBe(START_MONEY - 700);
    g.dispatch(0, { type: 'endTurn' });

    forceDice(g, 2, 1);
    g.dispatch(1, { type: 'roll' });
    expect(g.state.players[1].money).toBe(START_MONEY - 50);
    expect(g.state.players[0].money).toBe(START_MONEY - 700 + 50);
  });

  it('нельзя ходить не в свою очередь', () => {
    const g = twoPlayers();
    expect(g.can(1, { type: 'roll' })).toBe(false);
    expect(() => g.dispatch(1, { type: 'roll' })).toThrow();
  });

  it('дубль даёт ещё один бросок, три дубля — тюрьма', () => {
    const g = twoPlayers();
    forceDice(g, 1, 1);
    g.dispatch(0, { type: 'roll' }); // клетка 2 — Сюрприз
    if (g.state.phase === 'debt') g.dispatch(0, { type: 'payDebt' });
    if (g.state.phase === 'buy') g.dispatch(0, { type: 'decline' });
    while (g.state.phase === 'auction') g.dispatch(g.actor(), { type: 'pass' });
    expect(g.state.current).toBe(0);
    // Если карточка не отправила в тюрьму — снова бросок.
    if (!g.state.players[0].inJail) {
      expect(g.state.phase).toBe('roll');
      g.state.doublesCount = 2;
      g.state.players[0].position = 5;
      forceDice(g, 3, 3);
      g.dispatch(0, { type: 'roll' });
      expect(g.state.players[0].inJail).toBe(true);
      expect(g.state.players[0].position).toBe(10);
      expect(g.state.phase).toBe('end');
    }
  });

  it('проход через Старт даёт бонус', () => {
    const g = twoPlayers();
    g.state.players[0].position = 38;
    forceDice(g, 1, 2); // 38 + 3 = 1 (Капотня)
    g.dispatch(0, { type: 'roll' });
    expect(g.state.players[0].position).toBe(1);
    expect(g.state.players[0].money).toBe(START_MONEY + START_BONUS);
  });

  it('аукцион продаёт клетку тому, кто дал больше', () => {
    const g = twoPlayers();
    forceDice(g, 1, 2);
    g.dispatch(0, { type: 'roll' });
    g.dispatch(0, { type: 'decline' });
    expect(g.state.phase).toBe('auction');
    g.dispatch(0, { type: 'bid', amount: 100 });
    g.dispatch(1, { type: 'bid', amount: 200 });
    g.dispatch(0, { type: 'pass' });
    expect(g.state.cells[3].owner).toBe(1);
    expect(g.state.players[1].money).toBe(START_MONEY - 200);
    expect(g.state.phase).toBe('end');
  });

  it('строительство только при монополии и равномерно', () => {
    const g = twoPlayers();
    expect(g.can(0, { type: 'build', cell: 1 })).toBe(false);
    g.state.cells[1].owner = 0;
    g.state.cells[3].owner = 0;
    expect(g.rentFor(1, 7)).toBe(80); // двойная аренда за монополию
    g.dispatch(0, { type: 'build', cell: 1 });
    expect(g.can(0, { type: 'build', cell: 1 })).toBe(false); // неравномерно
    g.dispatch(0, { type: 'build', cell: 3 });
    g.dispatch(0, { type: 'build', cell: 1 });
    expect(g.state.cells[1].houses).toBe(2);
    expect(g.rentFor(1, 7)).toBe(BOARD[1].rent![2]);
    expect(g.can(0, { type: 'mortgage', cell: 3 })).toBe(false);
  });

  it('долг и банкротство передают имущество кредитору', () => {
    const g = twoPlayers();
    g.state.cells[39].owner = 1;
    g.state.cells[37].owner = 1;
    g.state.cells[39].houses = 5;
    g.state.cells[37].houses = 5;
    g.state.cells[1].owner = 0;
    g.state.players[0].money = 100;
    g.state.players[0].position = 35;
    forceDice(g, 2, 2); // 35 + 4 = 39 Рублёвка с отелем
    g.dispatch(0, { type: 'roll' });
    expect(g.state.phase).toBe('debt');
    expect(g.actor()).toBe(0);
    g.dispatch(0, { type: 'mortgage', cell: 1 });
    expect(g.can(0, { type: 'payDebt' })).toBe(false);
    g.dispatch(0, { type: 'bankrupt' });
    expect(g.state.phase).toBe('gameover');
    expect(g.state.winner).toBe(1);
    expect(g.state.cells[1].owner).toBe(1);
  });

  it('обмен переносит клетки и деньги', () => {
    const g = twoPlayers();
    g.state.cells[1].owner = 0;
    g.state.cells[3].owner = 1;
    g.dispatch(0, { type: 'proposeTrade', offer: { to: 1, giveCells: [], getCells: [3], giveMoney: 1000, getMoney: 0 } });
    expect(g.state.phase).toBe('trade');
    expect(g.actor()).toBe(1);
    g.dispatch(1, { type: 'acceptTrade' });
    expect(g.state.cells[3].owner).toBe(0);
    expect(g.state.players[1].money).toBe(START_MONEY + 1000);
    expect(g.state.phase).toBe('roll');
    expect(g.ownsGroup(0, 'brown')).toBe(true);
  });

  it('нельзя менять улицы с постройками в группе', () => {
    const g = twoPlayers();
    g.state.cells[1].owner = 0;
    g.state.cells[3].owner = 0;
    g.state.cells[1].houses = 1;
    expect(g.can(0, { type: 'proposeTrade', offer: { to: 1, giveCells: [3], getCells: [], giveMoney: 0, getMoney: 0 } })).toBe(false);
  });

  it('восстановленная партия Давид — Яна корректна и доигрывается', () => {
    const st = restoredDavidYana();
    expect(st.players.map((p) => p.money)).toEqual([1760, 890]);
    expect(st.cells.filter((c) => c.owner === 0)).toHaveLength(12);
    expect(st.cells.filter((c) => c.owner === 1)).toHaveLength(10);
    expect(st.current).toBe(1);
    for (const p of st.players) p.isBot = true;
    const g = new Game(st);
    let steps = 0;
    while (g.state.phase !== 'gameover' && steps < 20000) {
      const a = g.actor();
      g.dispatch(a, botDecide(g, a)!);
      steps++;
    }
    expect(g.state.phase).toBe('gameover');
  });

  it('можно заложить улицу, решая, покупать ли клетку', () => {
    const g = twoPlayers();
    g.state.cells[1].owner = 0;
    g.state.players[0].money = 500;
    forceDice(g, 1, 2); // Бирюлёво за 700
    g.dispatch(0, { type: 'roll' });
    expect(g.state.phase).toBe('buy');
    expect(g.can(0, { type: 'buy' })).toBe(false);
    g.dispatch(0, { type: 'mortgage', cell: 1 });
    expect(g.state.players[0].money).toBe(800);
    g.dispatch(0, { type: 'buy' });
    expect(g.state.cells[3].owner).toBe(0);
    expect(g.can(1, { type: 'mortgage', cell: 1 })).toBe(false);
  });

  it('код партии переносит состояние без потерь', () => {
    const st = restoredDavidYana();
    const back = importCode(exportCode(st))!;
    expect(back).not.toBeNull();
    expect(back.players.map((p) => [p.name, p.money, p.position])).toEqual(st.players.map((p) => [p.name, p.money, p.position]));
    expect(back.cells).toEqual(st.cells);
    expect(importCode('мусор')).toBeNull();
    expect(importCode('MM1.@@@')).toBeNull();
  });

  it('банкрот не получает имущество и деньги по долгам (найдено критиком)', () => {
    const g = Game.create(
      Array.from({ length: 4 }, (_, i) => ({ name: 'P' + i, isBot: false })),
      1,
    );
    const s = g.state;
    const A = s.players[0];
    A.inJail = true;
    A.jailTurns = 2;
    A.money = 100;
    A.position = 10;
    s.decks.surprise.order = ['s7', ...s.decks.surprise.order.filter((x) => x !== 's7')];
    s.decks.surprise.index = 0;
    s.players[1].money = 50;
    s.cells[1].owner = 1;
    s.cells[3].owner = 1;
    forceDice(g, 3, 4); // третья попытка в тюрьме → штраф 500, клетка 17 — «каждый дарит по 100»
    g.dispatch(0, { type: 'roll' });
    expect(s.phase).toBe('debt');
    expect(g.actor()).toBe(0);
    g.dispatch(0, { type: 'bankrupt' });
    expect(A.bankrupt).toBe(true);
    // Долг P1 выбывшему игроку отменён, улицы остаются у P1.
    expect(s.cells[1].owner).toBe(1);
    expect(s.cells[3].owner).toBe(1);
    expect(s.debts).toHaveLength(0);
    for (const c of s.cells) if (c.owner !== null) expect(s.players[c.owner].bankrupt).toBe(false);
  });

  it('нельзя объявить банкротство, если можно расплатиться', () => {
    const g = twoPlayers();
    g.state.cells[39].owner = 1;
    g.state.cells[39].houses = 0;
    g.state.cells[1].owner = 0;
    g.state.cells[3].owner = 0;
    g.state.cells[6].owner = 0;
    g.state.players[0].money = 300;
    g.state.players[0].position = 35;
    forceDice(g, 2, 2); // Рублёвка без домов: аренда 500
    g.dispatch(0, { type: 'roll' });
    expect(g.state.phase).toBe('debt');
    expect(g.can(0, { type: 'bankrupt' })).toBe(false); // можно заложить улицы
    g.dispatch(0, { type: 'mortgage', cell: 6 });
    g.dispatch(0, { type: 'payDebt' });
    expect(g.state.players[0].bankrupt).toBe(false);
  });

  it('итог аукциона не перебивает владельца, назначенного во время торгов', () => {
    const g = twoPlayers();
    forceDice(g, 1, 2);
    g.dispatch(0, { type: 'roll' });
    g.dispatch(0, { type: 'decline' });
    g.dispatch(0, { type: 'bid', amount: 100 });
    g.state.cells[3].owner = 1; // ручная правка
    g.dispatch(1, { type: 'pass' });
    expect(g.state.cells[3].owner).toBe(1);
    expect(g.state.players[0].money).toBe(START_MONEY);
  });

  it('перевод денег без обмена улицами', () => {
    const g = twoPlayers();
    g.dispatch(0, { type: 'transfer', to: 1, amount: 250 });
    expect(g.state.players[0].money).toBe(START_MONEY - 250);
    expect(g.state.players[1].money).toBe(START_MONEY + 250);
    expect(g.can(0, { type: 'transfer', to: 1, amount: START_MONEY })).toBe(false); // больше, чем есть
    expect(g.can(0, { type: 'transfer', to: 0, amount: 10 })).toBe(false); // себе
    expect(g.can(1, { type: 'transfer', to: 0, amount: 10 })).toBe(false); // не в свой ход
    // Просьба о деньгах — обычное предложение, партнёр решает сам.
    g.dispatch(0, { type: 'proposeTrade', offer: { to: 1, giveCells: [], getCells: [], giveMoney: 0, getMoney: 300 } });
    expect(g.state.phase).toBe('trade');
    g.dispatch(1, { type: 'acceptTrade' });
    expect(g.state.players[0].money).toBe(START_MONEY - 250 + 300);
  });

  it('дубль в тюрьме выпускает без штрафа на любой попытке', () => {
    for (const turns of [0, 1, 2]) {
      for (let d = 1; d <= 6; d++) {
        const g = twoPlayers(11);
        const p = g.state.players[0];
        p.inJail = true;
        p.position = 10;
        p.jailTurns = turns;
        forceDice(g, d, d);
        g.dispatch(0, { type: 'roll' });
        expect(p.inJail).toBe(false);
        const fined = g.drainEvents().some((e) => e.kind === 'notice' && e.title === 'Штраф');
        expect(fined).toBe(false);
      }
    }
  });

  it('старое сохранение с удалённой карточкой «Ремонт дороги» загружается и играется', () => {
    const g = twoPlayers();
    const st = structuredClone(g.state);
    st.decks.surprise.order = ['s13', ...st.decks.surprise.order];
    st.decks.surprise.index = 0;
    const g2 = new Game(st);
    expect(g2.state.decks.surprise.order).not.toContain('s13');
    g2.state.players[0].position = 0;
    forceDice(g2, 1, 1); // клетка 2 — «Сюрприз»
    expect(() => g2.dispatch(0, { type: 'roll' })).not.toThrow();
  });

  it('без лимита домов можно строить, даже если банк пуст', () => {
    const g = twoPlayers();
    const s = g.state;
    [26, 27, 29].forEach((id) => (s.cells[id].owner = 0));
    // Все 40 домов уже на поле: по 4 на десяти улицах соперника.
    [1, 3, 6, 8, 9, 11, 13, 14, 16, 18].forEach((id) => {
      s.cells[id].owner = 1;
      s.cells[id].houses = 4;
    });
    s.housesLeft = 0;
    expect(g.can(0, { type: 'build', cell: 26 })).toBe(false);
    s.rules = { unlimitedHouses: true };
    g.dispatch(0, { type: 'build', cell: 26 });
    expect(s.cells[26].houses).toBe(1);
    expect(s.housesLeft).toBe(0);
    g.dispatch(0, { type: 'sellHouse', cell: 26 });
    expect(s.cells[26].houses).toBe(0);
  });

  it('запас домов — 40, старые партии пересчитываются при загрузке', () => {
    const g = twoPlayers();
    const st = structuredClone(g.state);
    st.cells[1].owner = 0;
    st.cells[1].houses = 3;
    st.housesLeft = 0; // как в старом сохранении с лимитом 32
    const g2 = new Game(st);
    expect(g2.state.housesLeft).toBe(40 - 3);
  });

  it('после отказа бот не повторяет сделку, а только улучшает условия', () => {
    // Бот (P0) собрал 2 из 3 голубых, третья — у человека (P1).
    const g = Game.create(
      [
        { name: 'Бот', isBot: true },
        { name: 'Человек', isBot: false },
      ],
      5,
    );
    const s = g.state;
    s.cells[6].owner = 0;
    s.cells[8].owner = 0;
    s.cells[9].owner = 1;
    type P = { type: 'proposeTrade'; offer: { giveCells: number[]; getCells: number[]; giveMoney: number; getMoney: number } };
    let last: P | null = null;
    for (let round = 0; round < 12; round++) {
      const a = botDecide(g, 0);
      if (!a || a.type !== 'proposeTrade') break;
      const cur = a as P;
      if (last) {
        // Каждое новое предложение строго лучше прошлого: не меньше денег и улиц, и хоть что-то больше.
        expect(cur.offer.getCells).toEqual(last.offer.getCells);
        for (const c of last.offer.giveCells) expect(cur.offer.giveCells).toContain(c);
        expect(cur.offer.giveMoney).toBeGreaterThanOrEqual(last.offer.giveMoney);
        expect(
          cur.offer.giveMoney > last.offer.giveMoney || cur.offer.giveCells.length > last.offer.giveCells.length,
        ).toBe(true);
      }
      g.dispatch(0, a);
      g.dispatch(1, { type: 'rejectTrade' });
      s.turnNumber += 2; // следующий ход бота
      s.tradesThisTurn = 0;
      last = cur;
    }
    expect(last).not.toBeNull();
    // Даже через много ходов тот же отклонённый вариант не повторится.
    s.turnNumber += 100;
    expect(g.canReoffer({ ...last!.offer, from: 0, to: 1 })).toBe(false);
  });

  it('статистика: аренда записывается как платёж игрока игроку', () => {
    const g = twoPlayers();
    const cell = BOARD.findIndex((c) => c.type === 'property' && c.id > 3);
    g.state.cells[cell].owner = 1;
    g.state.players[0].position = cell - 3;
    forceDice(g, 1, 2);
    g.dispatch(0, { type: 'roll' });
    const rent = BOARD[cell].rent![0];
    expect(g.state.stats!.paid[0][1]).toBe(rent);
    expect(g.state.stats!.out[0].rent).toBe(rent);
    expect(g.state.stats!.in[1].rent).toBe(rent);
    expect(g.state.stats!.count[0].rentTimes).toBe(1);
  });

  it('боты с разными характерами доигрывают партию, характер сохраняется в партии', () => {
    const ids = PERSONAS.map((p) => p.id);
    ids.forEach((id, i) => {
      const trio = [id, ids[(i + 2) % ids.length], ids[(i + 4) % ids.length]];
      const g = Game.create(trio.map((style) => ({ name: style, isBot: true, style })), 100 + i);
      expect(g.state.players.map((p) => p.style)).toEqual(trio);
      let steps = 0;
      while (g.state.phase !== 'gameover' && steps < 30000) {
        const a = g.actor();
        const action = botDecide(g, a);
        expect(action).not.toBeNull();
        g.dispatch(a, action!);
        steps++;
      }
      expect(g.state.phase).toBe('gameover');
    });
  });

  it('Петя не предлагает обменов, а Лёва торгуется и после отказа добавляет', () => {
    const g = twoPlayers();
    const s = g.state;
    s.players[1].style = 'leva';
    // У Лёвы одна коричневая улица, вторая — у человека.
    const brown = BOARD.filter((c) => c.group === 'brown').map((c) => c.id);
    s.cells[brown[0]].owner = 1;
    s.cells[brown[1]].owner = 0;
    s.current = 1;
    s.phase = 'roll';
    const first = botDecide(g, 1);
    expect(first?.type).toBe('proposeTrade');
    g.dispatch(1, first!);
    g.dispatch(0, { type: 'rejectTrade' });
    const second = botDecide(g, 1);
    expect(second?.type).toBe('proposeTrade');
    if (first?.type === 'proposeTrade' && second?.type === 'proposeTrade') {
      expect(second.offer.giveMoney).toBeGreaterThan(first.offer.giveMoney);
    }
    s.players[1].style = 'petya';
    s.phase = 'roll';
    s.tradesThisTurn = 0;
    expect(botDecide(g, 1)?.type).not.toBe('proposeTrade');
  });

  it('боты доигрывают партию до конца без ошибок', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const g = Game.create(
        [
          { name: 'A', isBot: true },
          { name: 'B', isBot: true },
          { name: 'C', isBot: true },
          { name: 'D', isBot: true },
        ],
        seed,
      );
      let steps = 0;
      while (g.state.phase !== 'gameover' && steps < 20000) {
        const actor = g.actor();
        const action = botDecide(g, actor);
        expect(action).not.toBeNull();
        g.dispatch(actor, action!);
        steps++;
        for (const p of g.state.players) expect(p.money).toBeGreaterThanOrEqual(0);
        for (const c of g.state.cells) if (c.owner !== null) expect(g.state.players[c.owner].bankrupt).toBe(false);
        const s = g.state;
        expect(s.housesLeft).toBeGreaterThanOrEqual(0);
        expect(s.hotelsLeft).toBeGreaterThanOrEqual(0);
      }
      expect(g.state.phase).toBe('gameover');
      // Статистика сходится с деньгами: старт + пришло − ушло = на счету.
      const st = g.state.stats!;
      const sum = (r: Record<string, number | undefined>) => Object.values(r).reduce<number>((n, v) => n + (v ?? 0), 0);
      for (const p of g.state.players) expect(START_MONEY + sum(st.in[p.id]) - sum(st.out[p.id])).toBe(p.money);
      const paidTotal = st.paid.flat().reduce((n, v) => n + v, 0);
      expect(paidTotal).toBeGreaterThan(0);
      expect(st.worth.length).toBeGreaterThan(1);
      // Состояние сериализуемо для сохранения.
      expect(() => JSON.parse(JSON.stringify(g.state))).not.toThrow();
    }
  });
});
