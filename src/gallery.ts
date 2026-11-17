// Страница-галерея всех иконок поля (только для разработки: /gallery.html).
import { BOARD } from './data/board';
import { iconSvg, installIcons } from './ui/icons';

installIcons();
document.getElementById('g')!.innerHTML = BOARD.map(
  (c) => `<div class="it">${iconSvg(c.id)}${c.id}. ${c.short ?? c.name}</div>`,
).join('');
