// Страница-галерея всех иконок поля (только для разработки: /gallery.html).
import { BOARD } from './data/board';
import { PLAYER_COLORS } from './engine/game';
import { iconSvg, installIcons } from './ui/icons';
import { TOKEN_IDS, TOKEN_NAMES, tokenSvg } from './ui/tokens';

installIcons();
document.getElementById('g')!.innerHTML = BOARD.map(
  (c) => `<div class="it">${iconSvg(c.id)}${c.id}. ${c.short ?? c.name}</div>`,
).join('') +
  TOKEN_IDS.map((t, i) => `<div class="it">${tokenSvg(t, PLAYER_COLORS[i])}${TOKEN_NAMES[t]}</div>`).join('');
