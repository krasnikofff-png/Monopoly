import { TOKEN_GRADIENTS, TOKEN_SYMBOLS } from './tokens';

// Иконки клеток поля. Все рисунки — векторные (SVG), в едином «игрушечном» стиле:
// толстый тёмный контур, градиентная заливка, блики и мягкая тень снизу.
// Каждая иконка — <symbol id="ic-N"> с viewBox 0 0 100 100, где N — номер клетки.

const INK = '#1d2433';
const O = `stroke="${INK}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"`;
const O1 = `stroke="${INK}" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"`;

function lg(id: string, a: string, b: string, c: string, vertical = false): string {
  const dir = vertical ? 'x1="0" y1="0" x2="0" y2="1"' : 'x1="0" y1="0" x2="1" y2="0"';
  return `<linearGradient id="${id}" ${dir}><stop offset="0" stop-color="${a}"/><stop offset=".55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient>`;
}

const GRADIENTS = [
  lg('g-blue', '#7fd3ff', '#3a9bf0', '#1f5fbf'),
  lg('g-navy', '#6f8cff', '#2d4fc4', '#1a2f80'),
  lg('g-gold', '#ffe08a', '#f5b83d', '#c47d12'),
  lg('g-teal', '#b8f0e6', '#4cc2b0', '#23806f'),
  lg('g-gray', '#c9d4ea', '#8e9fc4', '#5b6c93'),
  lg('g-white', '#ffffff', '#e8ebf2', '#b9c0cf'),
  lg('g-red', '#ff9a8a', '#e5533d', '#a8301f'),
  lg('g-brick', '#eba083', '#c0583c', '#8a3a25'),
  lg('g-green', '#9be38f', '#3fb950', '#1f7a35'),
  lg('g-pink', '#ffc2df', '#f06aa8', '#b83a78'),
  lg('g-orange', '#ffd29a', '#ff9a2e', '#c96a0a'),
  lg('g-purple', '#d6c2ff', '#9b6dff', '#6334c9'),
  lg('g-brown', '#d9a679', '#a8693e', '#6e4122'),
  lg('g-yellow', '#fff3a6', '#ffd83d', '#d9a400'),
  lg('g-water', '#b5ecff', '#5cbcf0', '#2f86d0', true),
  `<radialGradient id="g-glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff6b0" stop-opacity=".95"/><stop offset="1" stop-color="#fff6b0" stop-opacity="0"/></radialGradient>`,
].join('');

// ——— Вспомогательные фигуры ———

const shadow = (rx = 38) => `<ellipse cx="50" cy="90" rx="${rx}" ry="6" fill="#000" opacity=".16"/>`;
const ground = () => `<path d="M10 86 Q50 79 90 86 L90 90 Q50 84 10 90 Z" fill="#3fb950"/>`;

function star(cx: number, cy: number, r: number, fill = '#ffcb2e', stroke = true): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="${fill}" ${stroke ? O1 : ''}/>`;
}

const sparkle = (x: number, y: number, s = 4, fill = '#ffcb2e') =>
  `<path d="M${x} ${y - s * 1.6} Q${x + s * 0.25} ${y - s * 0.25} ${x + s * 1.6} ${y} Q${x + s * 0.25} ${y + s * 0.25} ${x} ${y + s * 1.6} Q${x - s * 0.25} ${y + s * 0.25} ${x - s * 1.6} ${y} Q${x - s * 0.25} ${y - s * 0.25} ${x} ${y - s * 1.6} Z" fill="${fill}" ${O1}/>`;

/** Сетка окон. */
function windows(x: number, y: number, cols: number, rows: number, dx: number, dy: number, w: number, h: number): string {
  let s = '';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = (r * 7 + c * 3) % 5 === 0;
      s += `<rect x="${x + c * dx}" y="${y + r * dy}" width="${w}" height="${h}" rx="1" fill="${lit ? '#ffe9a8' : '#a8dcff'}" ${O1}/>`;
    }
  }
  return s;
}

const tree = (x: number, y: number, r: number) =>
  `<rect x="${x - 2}" y="${y}" width="4" height="${86 - y}" fill="url(#g-brown)" ${O1}/><circle cx="${x}" cy="${y - r * 0.6}" r="${r}" fill="url(#g-green)" ${O}/>`;

const highlight = (x: number, y: number, w: number, h: number) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${w / 2}" fill="#fff" opacity=".45"/>`;

function drop(cx: number, cy: number, s: number): string {
  return `<path d="M${cx} ${cy - s} C${cx + s * 0.2} ${cy - s * 0.4} ${cx + s * 0.75} ${cy} ${cx + s * 0.75} ${cy + s * 0.45} A${s * 0.75} ${s * 0.75} 0 0 1 ${cx - s * 0.75} ${cy + s * 0.45} C${cx - s * 0.75} ${cy} ${cx - s * 0.2} ${cy - s * 0.4} ${cx} ${cy - s} Z" fill="url(#g-water)" ${O}/>`;
}

// ——— Вокзалы: поезд ———
function train(grad: string): string {
  return `${shadow(30)}
    <path d="M30 86 L22 96 M70 86 L78 96" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
    <rect x="25" y="16" width="50" height="64" rx="14" fill="url(#${grad})" ${O}/>
    <rect x="25" y="56" width="50" height="7" fill="#fff" opacity=".85"/>
    <rect x="31" y="24" width="38" height="24" rx="5" fill="url(#g-water)" ${O}/>
    <path d="M35 27 L45 27 L37 44 L33 44 Z" fill="#fff" opacity=".5"/>
    <circle cx="36" cy="70" r="5" fill="url(#g-yellow)" ${O}/>
    <circle cx="64" cy="70" r="5" fill="url(#g-yellow)" ${O}/>
    <rect x="44" y="67" width="12" height="6" rx="2" fill="${INK}" opacity=".7"/>
    <rect x="30" y="78" width="40" height="8" rx="3" fill="url(#g-gray)" ${O}/>
    ${highlight(29, 22, 3, 30)}`;
}

// ——— Сами иконки ———

export const ICONS: Record<number, string> = {
  // Старт: зелёная стрелка и монета
  0: `${shadow(36)}
    <path d="M86 40 L46 40 L46 24 L12 52 L46 80 L46 64 L86 64 Z" fill="url(#g-green)" ${O}/>
    <path d="M80 44 L50 44" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".5"/>
    <circle cx="74" cy="20" r="12" fill="url(#g-gold)" ${O}/>
    <text x="74" y="25.5" text-anchor="middle" font-size="15" font-weight="800" fill="${INK}" font-family="Rubik, sans-serif">₽</text>`,

  // Капотня: завод с трубами
  1: `${shadow()}${ground()}
    <circle cx="70" cy="14" r="6" fill="url(#g-white)" ${O1}/><circle cx="80" cy="9" r="7" fill="url(#g-white)" ${O1}/><circle cx="90" cy="13" r="5" fill="url(#g-white)" ${O1}/>
    <rect x="56" y="30" width="8" height="30" fill="url(#g-white)" ${O}/><rect x="56" y="30" width="8" height="6" fill="#e5533d" ${O1}/>
    <rect x="70" y="20" width="11" height="66" fill="url(#g-white)" ${O}/>
    <rect x="70" y="20" width="11" height="8" fill="#e5533d" ${O1}/><rect x="70" y="38" width="11" height="8" fill="#e5533d" ${O1}/><rect x="70" y="56" width="11" height="8" fill="#e5533d" ${O1}/>
    <path d="M16 86 L16 58 L26 48 L26 58 L36 48 L36 58 L46 48 L46 58 L68 58 L68 86 Z" fill="url(#g-brick)" ${O}/>
    ${windows(22, 64, 4, 2, 11, 10, 6, 6)}`,

  // Сюрприз: подарок
  2: `${shadow(32)}
    <rect x="22" y="48" width="56" height="38" rx="3" fill="url(#g-pink)" ${O}/>
    <rect x="18" y="36" width="64" height="14" rx="3" fill="url(#g-pink)" ${O}/>
    <rect x="45" y="36" width="10" height="50" fill="url(#g-yellow)" ${O}/>
    <ellipse cx="39" cy="28" rx="11" ry="7" transform="rotate(-20 39 28)" fill="url(#g-yellow)" ${O}/>
    <ellipse cx="61" cy="28" rx="11" ry="7" transform="rotate(20 61 28)" fill="url(#g-yellow)" ${O}/>
    <circle cx="50" cy="33" r="5" fill="url(#g-gold)" ${O}/>
    ${highlight(26, 52, 3, 28)}${sparkle(86, 22, 3)}`,

  // Бирюлёво: панельная многоэтажка
  3: `${shadow()}${ground()}
    <rect x="22" y="22" width="48" height="5" fill="#5b6c93" ${O}/>
    <rect x="24" y="27" width="44" height="59" fill="url(#g-gray)" ${O}/>
    ${windows(28, 31, 4, 6, 10, 9, 6, 5)}
    ${tree(80, 70, 9)}`,

  // Документ с печатью (клетка 4 теперь «Сюрприз» — значок переопределён ниже)
  4: `${shadow(30)}
    <path d="M24 12 L62 12 L74 24 L74 82 L24 82 Z" fill="url(#g-white)" ${O}/>
    <path d="M62 12 L62 24 L74 24" fill="#d5dae5" ${O}/>
    <path d="M32 30 H58 M32 40 H66 M32 50 H62 M32 60 H48" stroke="#9aa4b8" stroke-width="3" stroke-linecap="round"/>
    <circle cx="64" cy="68" r="15" fill="#fff" stroke="#e5533d" stroke-width="4"/>
    <text x="64" y="74.5" text-anchor="middle" font-size="18" font-weight="800" fill="#e5533d" font-family="Rubik, sans-serif">₽</text>`,

  5: train('g-red'),

  // Выхино: знак метро
  6: `${shadow(26)}${ground()}
    <rect x="46" y="48" width="8" height="38" fill="url(#g-gray)" ${O}/>
    <circle cx="50" cy="32" r="22" fill="url(#g-white)" ${O}/>
    <path d="M36 43 L40.5 21 L50 34 L59.5 21 L64 43" fill="none" stroke="#e53935" stroke-width="6.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${highlight(33, 16, 3, 10)}`,

  // Шанс: знак вопроса
  7: `${shadow(26)}
    <text x="50" y="82" text-anchor="middle" font-size="86" font-weight="800" fill="url(#g-orange)" stroke="${INK}" stroke-width="3.5" paint-order="stroke" font-family="Rubik, sans-serif">?</text>
    ${sparkle(80, 22, 4)}${sparkle(20, 36, 3, '#fff')}`,

  // Марьино: яркая новостройка
  8: `${shadow()}${ground()}
    <rect x="36" y="14" width="30" height="72" fill="url(#g-white)" ${O}/>
    <rect x="36" y="20" width="30" height="7" fill="#f06aa8" ${O1}/><rect x="36" y="34" width="30" height="7" fill="#ffd83d" ${O1}/>
    <rect x="36" y="48" width="30" height="7" fill="#4cc2b0" ${O1}/><rect x="36" y="62" width="30" height="7" fill="#f06aa8" ${O1}/>
    <rect x="16" y="50" width="20" height="36" fill="url(#g-pink)" ${O}/>
    ${windows(20, 56, 2, 3, 8, 9, 5, 5)}
    ${tree(78, 72, 8)}`,

  // Митино: магнитола (радиорынок)
  9: `${shadow(36)}
    <path d="M30 40 L30 28 L70 28 L70 40" fill="none" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M74 40 L86 12" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/><circle cx="86" cy="12" r="3" fill="#e53935" ${O1}/>
    <rect x="12" y="38" width="76" height="44" rx="9" fill="url(#g-red)" ${O}/>
    <circle cx="32" cy="62" r="13" fill="${INK}"/><circle cx="32" cy="62" r="6" fill="url(#g-gray)" ${O1}/>
    <circle cx="68" cy="62" r="13" fill="${INK}"/><circle cx="68" cy="62" r="6" fill="url(#g-gray)" ${O1}/>
    <rect x="42" y="45" width="16" height="9" rx="2" fill="url(#g-water)" ${O1}/>
    <path d="M44 72 H56" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
    ${highlight(16, 42, 3, 34)}`,

  // Тюрьма: окно с решёткой
  10: `${shadow(34)}
    <rect x="18" y="16" width="64" height="66" rx="8" fill="url(#g-gray)" ${O}/>
    <rect x="26" y="24" width="48" height="50" rx="3" fill="#2b3550" ${O}/>
    <circle cx="62" cy="38" r="6" fill="#ffe9a8" opacity=".9"/>
    <rect x="33" y="22" width="6" height="54" rx="2" fill="url(#g-white)" ${O}/>
    <rect x="47" y="22" width="6" height="54" rx="2" fill="url(#g-white)" ${O}/>
    <rect x="61" y="22" width="6" height="54" rx="2" fill="url(#g-white)" ${O}/>`,

  // Сокольники: колесо обозрения
  11: `${shadow()}${ground()}
    <path d="M36 86 L50 44 L64 86" fill="none" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M36 86 L50 44 L64 86" fill="none" stroke="#8e9fc4" stroke-width="2.5" stroke-linejoin="round"/>
    <circle cx="50" cy="44" r="30" fill="none" stroke="${INK}" stroke-width="4"/>
    <circle cx="50" cy="44" r="30" fill="none" stroke="#f06aa8" stroke-width="2"/>
    <path d="M50 14 V74 M20 44 H80 M28.8 22.8 L71.2 65.2 M71.2 22.8 L28.8 65.2" stroke="${INK}" stroke-width="1.3" opacity=".6"/>
    ${[
      [80, 44, 'g-yellow'],
      [71.2, 65.2, 'g-teal'],
      [50, 74, 'g-red'],
      [28.8, 65.2, 'g-blue'],
      [20, 44, 'g-yellow'],
      [28.8, 22.8, 'g-teal'],
      [50, 14, 'g-red'],
      [71.2, 22.8, 'g-blue'],
    ]
      .map(([x, y, g]) => `<rect x="${Number(x) - 4.5}" y="${Number(y) - 2}" width="9" height="8" rx="2.5" fill="url(#${g})" ${O1}/>`)
      .join('')}
    <circle cx="50" cy="44" r="5" fill="url(#g-gold)" ${O}/>`,

  // Мосэнерго: лампочка
  12: `<circle cx="50" cy="40" r="38" fill="url(#g-glow)"/>${shadow(18)}
    <path d="M50 10 Q76 10 76 38 Q76 52 63 61 L63 70 L37 70 L37 61 Q24 52 24 38 Q24 10 50 10 Z" fill="url(#g-yellow)" ${O}/>
    <path d="M54 18 L38 42 L49 42 L44 62 L62 34 L51 34 Z" fill="url(#g-orange)" ${O1}/>
    <rect x="37" y="70" width="26" height="7" rx="2" fill="url(#g-gray)" ${O}/>
    <rect x="39" y="77" width="22" height="7" rx="2" fill="url(#g-gray)" ${O}/>
    <path d="M44 84 L56 84 L52 89 L48 89 Z" fill="${INK}"/>
    ${highlight(32, 22, 4, 18)}`,

  // Измайлово: деревянный кремль
  13: `${shadow()}${ground()}
    <rect x="16" y="56" width="18" height="30" fill="url(#g-white)" ${O}/>
    <path d="M14 56 L25 32 L36 56 Z" fill="url(#g-teal)" ${O}/>
    <rect x="66" y="56" width="18" height="30" fill="url(#g-white)" ${O}/>
    <path d="M64 56 L75 32 L86 56 Z" fill="url(#g-gold)" ${O}/>
    <rect x="38" y="42" width="24" height="44" fill="url(#g-white)" ${O}/>
    <path d="M35 44 L50 10 L65 44 Z" fill="url(#g-red)" ${O}/>
    <path d="M41 36 L45 30 L49 36 L53 30 L57 36 L61 30" fill="none" stroke="#fff" stroke-width="2" opacity=".8"/>
    <path d="M50 10 L50 3 L58 5.5 L50 8" fill="#e53935" ${O1}/>
    <path d="M44 86 L44 70 Q50 62 56 70 L56 86 Z" fill="url(#g-brown)" ${O}/>
    <rect x="22" y="64" width="6" height="8" fill="#a8dcff" ${O1}/><rect x="72" y="64" width="6" height="8" fill="#a8dcff" ${O1}/>`,

  // Таганка: театральные маски
  14: `${shadow(32)}
    <path d="M46 20 Q64 12 82 20 Q84 50 64 64 Q44 50 46 20 Z" fill="url(#g-purple)" ${O}/>
    <path d="M54 33 Q58 37 62 33 M68 33 Q72 37 76 33" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M56 52 Q65 43 74 52 Q65 48 56 52 Z" fill="${INK}" ${O1}/>
    <path d="M16 30 Q35 22 54 30 Q56 60 35 76 Q14 60 16 30 Z" fill="url(#g-gold)" ${O}/>
    <path d="M24 43 Q28 38 32 43 M38 43 Q42 38 46 43" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M25 55 Q35 68 45 55 Q35 60 25 55 Z" fill="${INK}" ${O1}/>
    <path d="M16 34 Q8 40 12 50 M54 34 Q60 30 60 24" fill="none" stroke="#e53935" stroke-width="3" stroke-linecap="round"/>
    ${highlight(20, 34, 3, 14)}`,

  15: train('g-blue'),

  // Красная Пресня: зоопарк (слон)
  16: `${shadow()}${ground()}
    <rect x="38" y="68" width="9" height="18" rx="2" fill="url(#g-gray)" ${O}/><rect x="52" y="68" width="9" height="18" rx="2" fill="url(#g-gray)" ${O}/>
    <rect x="66" y="68" width="9" height="18" rx="2" fill="url(#g-gray)" ${O}/>
    <path d="M80 56 Q88 58 86 68" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>
    <ellipse cx="58" cy="60" rx="25" ry="18" fill="url(#g-gray)" ${O}/>
    <rect x="28" y="68" width="9" height="18" rx="2" fill="url(#g-gray)" ${O}/>
    <path d="M22 58 Q12 66 16 80" fill="none" stroke="${INK}" stroke-width="10" stroke-linecap="round"/>
    <path d="M22 58 Q12 66 16 80" fill="none" stroke="#8e9fc4" stroke-width="5.5" stroke-linecap="round"/>
    <circle cx="30" cy="50" r="15" fill="url(#g-gray)" ${O}/>
    <ellipse cx="40" cy="50" rx="9" ry="13" fill="#b4c0dc" ${O}/>
    <circle cx="25" cy="46" r="2.2" fill="${INK}"/>
    <path d="M22 60 Q18 62 20 66" stroke="#fff" stroke-width="2.5" stroke-linecap="round" fill="none"/>`,

  // Сюрприз
  17: '',

  // Хамовники: стадион Лужники
  18: `${shadow(42)}
    <ellipse cx="50" cy="68" rx="42" ry="17" fill="url(#g-gray)" ${O}/>
    <ellipse cx="50" cy="60" rx="42" ry="17" fill="url(#g-white)" ${O}/>
    <ellipse cx="50" cy="60" rx="30" ry="10.5" fill="url(#g-green)" ${O}/>
    <path d="M50 49.5 V70.5" stroke="#fff" stroke-width="1.6"/><ellipse cx="50" cy="60" rx="5" ry="3" fill="none" stroke="#fff" stroke-width="1.6"/>
    <circle cx="50" cy="24" r="12" fill="url(#g-white)" ${O}/>
    <path d="M50 19 L55 22.5 L53 28.5 L47 28.5 L45 22.5 Z" fill="${INK}"/>
    <path d="M50 12 L50 19 M38.5 21 L45 22.5 M41 33 L47 28.5 M59 33 L53 28.5 M61.5 21 L55 22.5" stroke="${INK}" stroke-width="1.4"/>
    ${sparkle(18, 22, 3)}${sparkle(82, 26, 3, '#fff')}`,

  // Замоскворечье: картина Третьяковки
  19: `${shadow(30)}
    <path d="M32 70 L24 88 M68 70 L76 88 M50 70 L50 88" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>
    <path d="M32 70 L24 88 M68 70 L76 88 M50 70 L50 88" stroke="#a8693e" stroke-width="2.5" stroke-linecap="round"/>
    <rect x="16" y="18" width="68" height="54" rx="3" fill="url(#g-gold)" ${O}/>
    <rect x="24" y="26" width="52" height="38" fill="url(#g-water)" ${O1}/>
    <circle cx="64" cy="36" r="5" fill="#fff3a6"/>
    <path d="M24 64 L24 52 Q36 40 48 52 Q60 42 76 50 L76 64 Z" fill="url(#g-green)"/>
    <path d="M24 64 L36 58 L52 62 L76 58 L76 64 Z" fill="#2f7a3a"/>
    <rect x="24" y="26" width="52" height="38" fill="none" ${O1}/>`,

  // Парк Горького: большое дерево
  20: `${shadow(34)}
    <rect x="44" y="52" width="12" height="36" rx="3" fill="url(#g-brown)" ${O}/>
    <g stroke="${INK}" stroke-width="4.4"><circle cx="32" cy="46" r="17"/><circle cx="68" cy="46" r="17"/><circle cx="50" cy="28" r="21"/></g>
    <g fill="url(#g-green)"><circle cx="32" cy="46" r="17"/><circle cx="68" cy="46" r="17"/><circle cx="50" cy="28" r="21"/></g>
    <circle cx="38" cy="24" r="6" fill="#fff" opacity=".35"/>
    <circle cx="28" cy="50" r="3" fill="#e53935" ${O1}/><circle cx="62" cy="36" r="3" fill="#e53935" ${O1}/><circle cx="72" cy="54" r="3" fill="#e53935" ${O1}/>`,

  // Маросейка: чашка кофе
  21: `${shadow(32)}
    <path d="M42 34 Q37 26 42 18 Q47 10 42 4 M56 34 Q51 26 56 18 Q61 10 56 4" fill="none" stroke="#b9c0cf" stroke-width="3.5" stroke-linecap="round"/>
    <ellipse cx="50" cy="84" rx="32" ry="6" fill="url(#g-white)" ${O}/>
    <path d="M68 50 Q86 48 82 62 Q78 74 64 72" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
    <path d="M68 50 Q86 48 82 62 Q78 74 64 72" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
    <path d="M26 40 L74 40 L68 76 Q50 84 32 76 Z" fill="url(#g-white)" ${O}/>
    <path d="M28 52 L72 52 L70.5 60 L29.5 60 Z" fill="url(#g-red)" ${O1}/>
    <ellipse cx="50" cy="40" rx="24" ry="5" fill="url(#g-brown)" ${O}/>
    ${highlight(32, 44, 3, 26)}`,

  // Шанс
  22: '',

  // Покровка: фонарь и старый дом
  23: `${shadow()}${ground()}
    <path d="M36 42 L62 20 L88 42 Z" fill="url(#g-teal)" ${O}/>
    <rect x="40" y="40" width="44" height="46" fill="url(#g-brick)" ${O}/>
    <path d="M47 58 L47 50 Q51 44 55 50 L55 58 Z M69 58 L69 50 Q73 44 77 50 L77 58 Z" fill="#ffe9a8" ${O1}/>
    <path d="M56 86 L56 70 Q62 63 68 70 L68 86 Z" fill="url(#g-brown)" ${O}/>
    <circle cx="22" cy="26" r="16" fill="url(#g-glow)"/>
    <path d="M22 32 L22 86" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>
    <path d="M22 32 L22 86" stroke="#5b6c93" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M14 32 L30 32 L27 18 L17 18 Z" fill="url(#g-yellow)" ${O}/>
    <path d="M15 18 L22 12 L29 18 Z" fill="${INK}"/>
    <rect x="17" y="82" width="10" height="5" fill="${INK}"/>`,

  // Чистые пруды: лебедь
  24: `${shadow(40)}
    <ellipse cx="50" cy="76" rx="42" ry="12" fill="url(#g-water)" ${O}/>
    <path d="M18 80 Q24 77 30 80 M68 82 Q74 79 80 82" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M26 66 Q28 50 52 54 Q70 56 76 66 Q62 76 44 74 Q30 74 26 66 Z" fill="url(#g-white)" ${O}/>
    <path d="M38 62 Q50 56 64 62" fill="none" stroke="#b9c0cf" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M54 56 Q44 38 52 26 Q57 19 63 24" fill="none" stroke="${INK}" stroke-width="10" stroke-linecap="round"/>
    <path d="M54 56 Q44 38 52 26 Q57 19 63 24" fill="none" stroke="#fff" stroke-width="5.6" stroke-linecap="round"/>
    <path d="M63 22 L74 26 L63 29 Z" fill="url(#g-orange)" ${O1}/>
    <circle cx="59" cy="24" r="1.8" fill="${INK}"/>`,

  25: train('g-green'),

  // Никитская: ноты (консерватория)
  26: `${shadow(30)}
    <path d="M10 34 H90 M10 46 H90 M10 58 H90" stroke="#b9c0cf" stroke-width="1.6"/>
    <path d="M41 30 L83 20 L83 31 L41 41 Z" fill="${INK}"/>
    <rect x="41" y="30" width="5" height="44" fill="${INK}"/>
    <rect x="78" y="20" width="5" height="44" fill="${INK}"/>
    <ellipse cx="34" cy="74" rx="11" ry="8" transform="rotate(-22 34 74)" fill="url(#g-purple)" ${O}/>
    <ellipse cx="71" cy="64" rx="11" ry="8" transform="rotate(-22 71 64)" fill="url(#g-purple)" ${O}/>
    <ellipse cx="30" cy="71" rx="3" ry="2" transform="rotate(-22 30 71)" fill="#fff" opacity=".6"/>
    ${sparkle(18, 22, 3.5)}`,

  // Тверская: сталинская высотка
  27: `${shadow()}${ground()}
    <rect x="16" y="58" width="68" height="28" fill="url(#g-white)" ${O}/>
    <rect x="30" y="38" width="40" height="22" fill="url(#g-white)" ${O}/>
    <rect x="39" y="22" width="22" height="18" fill="url(#g-white)" ${O}/>
    <path d="M44 22 L50 8 L56 22 Z" fill="url(#g-gold)" ${O}/>
    <path d="M50 8 V3" stroke="${INK}" stroke-width="2"/>
    ${star(50, 4, 4.5, '#e53935')}
    ${windows(21, 63, 6, 2, 10.5, 10, 5, 6)}
    ${windows(35, 43, 4, 2, 8.5, 8, 5, 5)}
    ${windows(44, 27, 2, 1, 8, 8, 5, 6)}`,

  // Мосводоканал: кран и капли
  28: `${shadow(32)}
    <rect x="8" y="32" width="38" height="14" fill="url(#g-gray)" ${O}/>
    <path d="M44 28 L66 28 Q78 28 78 40 L78 50 L66 50 L66 44 Q66 42 64 42 L44 42 Z" fill="url(#g-gray)" ${O}/>
    <rect x="48" y="18" width="10" height="10" fill="url(#g-gray)" ${O}/>
    <rect x="38" y="12" width="30" height="7" rx="3.5" fill="url(#g-red)" ${O}/>
    ${drop(72, 64, 8)}${drop(72, 82, 6)}
    ${highlight(12, 35, 30, 3)}`,

  // Патриаршие пруды: скамейка и чёрный кот
  29: `${shadow()}
    <ellipse cx="54" cy="44" rx="40" ry="7" fill="url(#g-water)" ${O}/>
    ${ground()}
    <path d="M24 60 L24 86 M64 60 L64 86" stroke="${INK}" stroke-width="3.5"/>
    <rect x="18" y="40" width="52" height="7" rx="2" fill="url(#g-brown)" ${O}/>
    <rect x="18" y="49" width="52" height="7" rx="2" fill="url(#g-brown)" ${O}/>
    <rect x="16" y="60" width="56" height="7" rx="2" fill="url(#g-brown)" ${O}/>
    <circle cx="48" cy="52" r="8" fill="${INK}"/>
    <circle cx="48" cy="40" r="6.5" fill="${INK}"/>
    <path d="M42.5 37 L43 29 L47 34 Z M53.5 37 L53 29 L49 34 Z" fill="${INK}"/>
    <circle cx="45.5" cy="40" r="1.4" fill="#ffd83d"/><circle cx="50.5" cy="40" r="1.4" fill="#ffd83d"/>
    <path d="M56 56 Q62 54 60 46" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
    <path d="M84 86 L84 40" stroke="${INK}" stroke-width="3"/>
    <circle cx="84" cy="36" r="5" fill="url(#g-yellow)" ${O}/>`,

  // В тюрьму: полицейская фуражка
  30: `${shadow(34)}
    <path d="M16 50 Q16 24 50 20 Q84 24 84 50 Z" fill="url(#g-navy)" ${O}/>
    <rect x="18" y="48" width="64" height="11" fill="#e53935" ${O}/>
    <path d="M22 58 Q50 74 78 58 L76 66 Q50 82 24 66 Z" fill="${INK}"/>
    ${star(50, 36, 8)}
    ${highlight(26, 30, 3, 14)}`,

  // Остоженка: золотые слитки
  31: `${shadow(42)}
    ${[
      [8, 72],
      [36, 72],
      [64, 72],
      [22, 58],
      [50, 58],
      [36, 44],
    ]
      .map(
        ([x, y]) =>
          `<path d="M${x + 4} ${y} L${x + 24} ${y} L${x + 28} ${y + 14} L${x} ${y + 14} Z" fill="url(#g-gold)" ${O}/><path d="M${x + 6} ${y + 3} L${x + 14} ${y + 3}" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".7"/>`,
      )
      .join('')}
    ${sparkle(76, 30, 4)}${sparkle(22, 36, 3, '#fff')}`,

  // Пречистенка: Храм Христа Спасителя
  32: `${shadow()}
    <rect x="22" y="56" width="56" height="30" fill="url(#g-white)" ${O}/>
    <rect x="18" y="44" width="12" height="12" fill="url(#g-white)" ${O}/><rect x="70" y="44" width="12" height="12" fill="url(#g-white)" ${O}/>
    <path d="M17 44 Q24 30 31 44 Z" fill="url(#g-gold)" ${O}/><path d="M69 44 Q76 30 83 44 Z" fill="url(#g-gold)" ${O}/>
    <rect x="37" y="36" width="26" height="20" fill="url(#g-white)" ${O}/>
    <path d="M35 38 Q35 14 50 10 Q65 14 65 38 Z" fill="url(#g-gold)" ${O}/>
    <path d="M50 10 V1 M46 4.5 H54" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M42 52 L42 44 Q44 41 46 44 L46 52 Z M54 52 L54 44 Q56 41 58 44 L58 52 Z" fill="#a8dcff" ${O1}/>
    <path d="M44 86 L44 72 Q50 64 56 72 L56 86 Z" fill="url(#g-brown)" ${O}/>
    <path d="M28 66 V78 M34 66 V78 M66 66 V78 M72 66 V78" stroke="#b9c0cf" stroke-width="2.5"/>
    ${highlight(40, 18, 3, 16)}`,

  // Сюрприз
  33: '',

  // Кутузовский проспект: Триумфальная арка
  34: `${shadow()}
    <path d="M18 86 L18 38 L82 38 L82 86 L62 86 L62 64 Q50 46 38 64 L38 86 Z" fill="url(#g-white)" ${O}/>
    <rect x="14" y="28" width="72" height="11" fill="url(#g-white)" ${O}/>
    <path d="M24 44 V82 M32 44 V82 M68 44 V82 M76 44 V82" stroke="#9aa4b8" stroke-width="2.5"/>
    <path d="M34 28 L38 16 L46 20 L50 10 L54 20 L62 16 L66 28 Z" fill="url(#g-gold)" ${O}/>
    <path d="M30 34 H70" stroke="#c47d12" stroke-width="2"/>`,

  35: train('g-purple'),

  // Шанс
  36: '',

  // Москва-Сити: небоскрёбы
  37: `${shadow(40)}
    <path d="M12 86 Q50 78 88 86 L88 90 Q50 83 12 90 Z" fill="#3fb950"/>
    <path d="M20 86 L20 40 L30 34 L30 86 Z" fill="url(#g-gray)" ${O}/>
    <path d="M62 86 L60 26 Q66 20 74 24 L76 86 Z" fill="url(#g-teal)" ${O}/>
    <path d="M61 40 Q68 36 75 40 M61 54 Q68 50 75.5 54 M61.5 68 Q68 64 75.7 68" fill="none" stroke="${INK}" stroke-width="1.2" opacity=".45"/>
    <path d="M38 86 L38 22 L46 12 L54 22 L54 86 Z" fill="url(#g-blue)" ${O}/>
    <path d="M46 12 L46 4" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>
    <circle cx="46" cy="4" r="2.2" fill="#ff5a5f" ${O1}/>
    <path d="M38 34 H54 M38 46 H54 M38 58 H54 M38 70 H54" stroke="${INK}" stroke-width="1" opacity=".25"/>
    <path d="M40 24 L44 19 L44 80 L40 80 Z" fill="#fff" opacity=".35"/>
    <path d="M26 86 L26 52 L37 46 L37 86 Z" fill="url(#g-gold)" ${O}/>
    <path d="M26 60 H37 M26 68 H37 M26 76 H37" stroke="${INK}" stroke-width="1" opacity=".3"/>
    <path d="M76 86 L76 50 L84 54 L84 86 Z" fill="url(#g-blue)" ${O}/>
    ${sparkle(84, 22, 3.5)}${sparkle(16, 28, 2.5, '#fff')}`,

  // Налог на роскошь: бриллиант
  38: `${shadow(28)}
    <path d="M22 36 L36 20 L64 20 L78 36 L50 80 Z" fill="url(#g-water)" ${O}/>
    <path d="M22 36 H78 M36 20 L42 36 L50 80 L58 36 L64 20 M42 36 L50 20 L58 36" fill="none" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M36 20 L42 36 L22 36 Z" fill="#fff" opacity=".55"/>
    <path d="M42 36 L50 80 L28 42 Z" fill="#fff" opacity=".3"/>
    ${sparkle(80, 18, 4)}${sparkle(18, 62, 3, '#fff')}`,

  // Рублёвка: особняк с колоннами
  39: `${shadow(42)}${ground()}
    <rect x="20" y="46" width="60" height="40" fill="url(#g-white)" ${O}/>
    <path d="M14 48 L50 22 L86 48 Z" fill="url(#g-red)" ${O}/>
    <circle cx="50" cy="38" r="4" fill="#a8dcff" ${O1}/>
    ${[28, 40, 56, 68].map((x) => `<rect x="${x}" y="50" width="5" height="36" fill="url(#g-white)" ${O1}/>`).join('')}
    <path d="M45 86 L45 66 Q50 60 55 66 L55 86 Z" fill="url(#g-brown)" ${O}/>
    ${star(80, 20, 6)}${sparkle(18, 30, 3, '#fff')}`,
};

// Повторяющиеся клетки используют общий рисунок.
ICONS[4] = ICONS[2];
ICONS[17] = ICONS[2];
ICONS[33] = ICONS[2];
ICONS[22] = ICONS[7];
ICONS[36] = ICONS[7];

/** Вставляет все символы (иконки клеток и фишки) в документ один раз. */
export function installIcons(): void {
  if (document.getElementById('mm-icons')) return;
  const symbols =
    Object.entries(ICONS)
      .map(([id, body]) => `<symbol id="ic-${id}" viewBox="0 0 100 100">${body}</symbol>`)
      .join('') +
    Object.entries(TOKEN_SYMBOLS)
      .map(([id, body]) => `<symbol id="tok-${id}" viewBox="0 0 100 100" overflow="visible">${body}</symbol>`)
      .join('');
  const holder = document.createElement('div');
  holder.innerHTML = `<svg id="mm-icons" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${GRADIENTS}${TOKEN_GRADIENTS}</defs>${symbols}</svg>`;
  document.body.prepend(holder.firstElementChild!);
}

export function iconSvg(id: number, cls = 'ico'): string {
  return `<svg class="${cls}" viewBox="0 0 100 100" aria-hidden="true"><use href="#ic-${id}"/></svg>`;
}
