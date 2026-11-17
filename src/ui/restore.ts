// Партия Давид — Яна, восстановленная по скриншоту от 13:11 (старое сохранение пропало
// вместе с памятью браузера). Владельцы клеток — по цвету рамок на поле, деньги и позиции фишек —
// с экрана. Колоды карточек перемешаны заново, журнал ходов начинается с чистого листа.
import { Game, PLAYER_COLORS } from '../engine/game';
import type { GameState } from '../engine/types';

export const RESTORE_LABEL = 'Партия Давид — Яна (13:11)';

export function restoredDavidYana(): GameState {
  const game = Game.create([
    { name: 'Давид', isBot: false, color: PLAYER_COLORS[0], token: 'car' },
    { name: 'Яна', isBot: false, color: PLAYER_COLORS[1], token: 'hat' },
  ]);
  const s = game.state;
  const david = [1, 3, 5, 6, 8, 13, 18, 24, 26, 32, 34, 35];
  const yana = [11, 15, 16, 19, 21, 23, 28, 29, 37, 39];
  for (const id of david) s.cells[id].owner = 0;
  for (const id of yana) s.cells[id].owner = 1;
  // По одному дому на Капотне и Бирюлёво (аренда 200 и 250 ₽ на скриншоте).
  s.cells[1].houses = 1;
  s.cells[3].houses = 1;
  s.housesLeft -= 2;
  s.players[0].money = 1760;
  s.players[0].position = 11;
  s.players[1].money = 890;
  s.players[1].position = 21;
  s.current = 1;
  s.phase = 'roll';
  s.turnNumber = 60;
  s.log = ['Партия восстановлена по скриншоту. Ходит Яна.'];
  return s;
}
