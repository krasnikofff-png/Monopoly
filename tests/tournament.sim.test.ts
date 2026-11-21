import { botDecide } from '../src/engine/bot';
import { Game } from '../src/engine/game';
import { PERSONAS } from '../src/engine/personas';
import { it } from 'vitest';

declare const process: { env: Record<string, string | undefined> };

// Турнир характеров ботов: SIM=1 npx vitest run tests/tournament.sim.test.ts
it.runIf(process.env.SIM)('турнир характеров', () => {
  const ids = PERSONAS.map((p) => p.id);
  const wins: Record<string, number> = {};
  const games: Record<string, number> = {};
  const traits: Record<string, { trades: number; built: number; buys: number; jail: number; turns: number; n: number }> = {};
  let unfinished = 0;
  let seed = Number(process.env.SEED ?? 1);
  for (let i = 0; i < ids.length; i++)
    for (let j = 0; j < ids.length; j++) {
      if (i === j) continue;
      for (let k = 0; k < 4; k++) {
        const pair = [ids[i], ids[j], ids[(i + j + k) % ids.length]];
        const g = Game.create(pair.map((s, n) => ({ name: s + n, isBot: true, style: s })), seed++);
        let steps = 0;
        while (g.state.phase !== 'gameover' && steps < 30000) {
          const a = g.actor();
          g.dispatch(a, botDecide(g, a)!);
          steps++;
        }
        if (g.state.phase !== 'gameover') { unfinished++; continue; }
        const w = g.state.players[g.state.winner!].style!;
        wins[w] = (wins[w] ?? 0) + 1;
        g.state.players.forEach((p) => {
          games[p.style!] = (games[p.style!] ?? 0) + 1;
          const t = (traits[p.style!] ??= { trades: 0, built: 0, buys: 0, jail: 0, turns: 0, n: 0 });
          const c = g.state.stats!.count[p.id];
          t.trades += c.trades ?? 0; t.built += c.built ?? 0; t.buys += (c.buys ?? 0) + (c.auctions ?? 0); t.jail += c.jail ?? 0; t.turns += g.state.turnNumber; t.n++;
        });
      }
    }
  const rows = ids.map((id) => {
    const t = traits[id];
    return `${id.padEnd(10)} win% ${((100 * (wins[id] ?? 0)) / games[id]).toFixed(0).padStart(3)}  trades ${(t.trades / t.n).toFixed(1)}  built ${(t.built / t.n).toFixed(1)}  buys ${(t.buys / t.n).toFixed(1)}  jail ${(t.jail / t.n).toFixed(1)}  turns ${(t.turns / t.n).toFixed(0)}`;
  });
  console.log(rows.join('\n') + `\nunfinished ${unfinished}`);
}, 600000);
