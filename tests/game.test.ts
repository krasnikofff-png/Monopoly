import { describe, expect, it } from 'vitest';
import { BOARD, START_BONUS, START_MONEY } from '../src/data/board';
import { botDecide } from '../src/engine/bot';
import { Game } from '../src/engine/game';
import { restoredDavidYana } from '../src/ui/restore';

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
        const s = g.state;
        expect(s.housesLeft).toBeGreaterThanOrEqual(0);
        expect(s.hotelsLeft).toBeGreaterThanOrEqual(0);
      }
      expect(g.state.phase).toBe('gameover');
      // Состояние сериализуемо для сохранения.
      expect(() => JSON.parse(JSON.stringify(g.state))).not.toThrow();
    }
  });
});
