// Фишки игроков (SVG): одноцветные, «металлические» — как литые оловянные фигурки.
// Различаются формой; цвет игрока остаётся на его панели и рамках купленных клеток.

const INK = '#1d2433';
const O = `stroke="${INK}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"`;
const O1 = `stroke="${INK}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"`;
const P = `fill="url(#m-body)"`;

/** Градиенты металла (подключаются в installIcons). */
export const TOKEN_GRADIENTS = [
  `<linearGradient id="m-body" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".3" stop-color="#cfd5de"/><stop offset=".55" stop-color="#8e98a7"/><stop offset=".75" stop-color="#dde2e9"/><stop offset="1" stop-color="#6b7482"/></linearGradient>`,
  `<linearGradient id="m-light" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#e3e7ed"/><stop offset="1" stop-color="#aab2bf"/></linearGradient>`,
  `<linearGradient id="m-dark" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9aa3b1"/><stop offset=".6" stop-color="#5f6877"/><stop offset="1" stop-color="#3c434e"/></linearGradient>`,
].join('');
const shadow = (rx = 34) => `<ellipse cx="50" cy="88" rx="${rx}" ry="6" fill="#000" opacity=".2"/>`;
const shine = (d: string) => `<path d="${d}" fill="#fff" opacity=".4"/>`;
const shade = (d: string) => `<path d="${d}" fill="#000" opacity=".18"/>`;

export const TOKEN_IDS = ['car', 'hat', 'dog', 'rocket', 'cat', 'ship'] as const;
export type TokenId = (typeof TOKEN_IDS)[number];

export const TOKEN_NAMES: Record<TokenId, string> = {
  car: 'Машинка',
  hat: 'Цилиндр',
  dog: 'Собака',
  rocket: 'Ракета',
  cat: 'Кошка',
  ship: 'Кораблик',
};

/** Старые сохранения хранили фишки как эмодзи. */
const LEGACY: Record<string, TokenId> = { '🚗': 'car', '🎩': 'hat', '🐶': 'dog', '🚀': 'rocket', '🐱': 'cat', '⛵': 'ship' };

export function normalizeToken(t: string): TokenId {
  if ((TOKEN_IDS as readonly string[]).includes(t)) return t as TokenId;
  return LEGACY[t] ?? 'car';
}

export const TOKEN_SYMBOLS: Record<TokenId, string> = {
  car: `${shadow(38)}
    <path d="M10 76 L12 60 Q14 53 23 53 L32 53 L41 40 Q44 36 51 36 L65 36 Q71 36 75 42 L82 53 Q90 54 90 62 L90 76 Z" ${P} ${O}/>
    <path d="M44 41 Q46 40 50 40 L55 40 L55 53 L37 53 Z" fill="url(#m-dark)" ${O1}/>
    <path d="M59 40 L64 40 Q68 40 71 44 L77 53 L59 53 Z" fill="url(#m-dark)" ${O1}/>
    ${shine('M16 60 Q17 57 22 57 L80 57 Q84 57 85 60 L85 62 L16 62 Z')}
    ${shade('M10 70 L90 70 L90 76 L10 76 Z')}
    <circle cx="86" cy="62" r="3" fill="#ffffff" ${O1}/>
    <circle cx="29" cy="76" r="10" fill="${INK}"/><circle cx="29" cy="76" r="4.5" fill="url(#m-light)" ${O1}/>
    <circle cx="71" cy="76" r="10" fill="${INK}"/><circle cx="71" cy="76" r="4.5" fill="url(#m-light)" ${O1}/>`,

  hat: `${shadow(38)}
    <ellipse cx="50" cy="76" rx="38" ry="10" ${P} ${O}/>
    ${shade('M14 77 Q50 92 86 77 Q86 82 50 86 Q14 82 14 77 Z')}
    <path d="M28 74 L31 22 Q50 15 69 22 L72 74 Q50 80 28 74 Z" ${P} ${O}/>
    <ellipse cx="50" cy="22" rx="19" ry="5.5" ${P} ${O}/>
    <ellipse cx="50" cy="22" rx="19" ry="5.5" fill="#fff" opacity=".25"/>
    <path d="M29.6 56 Q50 61 70.4 56 L71.2 68 Q50 74 28.8 68 Z" fill="${INK}"/>
    <rect x="44" y="58" width="10" height="9" rx="1.5" fill="url(#m-light)" ${O1}/>
    ${shine('M35 28 L39 27 L37 54 L33 54 Z')}`,

  dog: `${shadow(34)}
    <path d="M72 62 Q86 58 84 44" fill="none" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>
    <path d="M72 62 Q86 58 84 44" fill="none" stroke="#b3bbc7" stroke-width="4" stroke-linecap="round"/>
    <ellipse cx="56" cy="66" rx="22" ry="18" ${P} ${O}/>
    <rect x="36" y="68" width="10" height="18" rx="4" ${P} ${O}/>
    <rect x="58" y="72" width="10" height="14" rx="4" ${P} ${O}/>
    <path d="M30 52 Q40 58 52 52" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
    <path d="M30 52 Q40 58 52 52" fill="none" stroke="url(#m-light)" stroke-width="3.5" stroke-linecap="round"/>
    <circle cx="42" cy="34" r="18" ${P} ${O}/>
    <path d="M48 20 Q66 18 62 44 Q54 40 50 30 Z" ${P} ${O}/>
    ${shade('M48 20 Q66 18 62 44 Q54 40 50 30 Z')}
    <ellipse cx="29" cy="42" rx="11" ry="8.5" fill="url(#m-light)" ${O}/>
    <ellipse cx="22" cy="38.5" rx="4.5" ry="3.5" fill="${INK}"/>
    <circle cx="40" cy="30" r="3" fill="${INK}"/><circle cx="41" cy="29" r="1" fill="#fff"/>
    <path d="M27 48 Q28 54 32 52" fill="url(#m-dark)" ${O1}/>
    ${shine('M34 20 Q38 17 44 18 Q38 20 36 25 Z')}`,

  rocket: `${shadow(26)}
    <path d="M41 70 Q50 98 59 70 Z" fill="url(#m-dark)" ${O1}/>
    <path d="M45 70 Q50 88 55 70 Z" fill="#eef1f5"/>
    <path d="M34 52 L18 74 L35 70 Z" ${P} ${O}/>
    <path d="M66 52 L82 74 L65 70 Z" ${P} ${O}/>
    <path d="M50 8 Q70 24 67 70 L33 70 Q30 24 50 8 Z" fill="url(#m-light)" ${O}/>
    <path d="M50 8 Q61 16 65 30 L35 30 Q39 16 50 8 Z" ${P} ${O}/>
    <rect x="36" y="64" width="28" height="7" rx="2" ${P} ${O}/>
    <circle cx="50" cy="44" r="9" fill="url(#m-dark)" ${O}/>
    <path d="M45 40 Q47 37 51 37" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <path d="M50 70 V64" stroke="${INK}" stroke-width="1.6"/>
    ${shine('M38 32 L41 32 L40 60 L37 60 Z')}`,

  cat: `${shadow(30)}
    <path d="M64 82 Q86 80 82 56" fill="none" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>
    <path d="M64 82 Q86 80 82 56" fill="none" stroke="#b3bbc7" stroke-width="4" stroke-linecap="round"/>
    <path d="M32 86 Q26 60 40 48 L60 48 Q74 60 68 86 Z" ${P} ${O}/>
    <ellipse cx="50" cy="68" rx="9" ry="13" fill="#fff" opacity=".75"/>
    <path d="M35 28 L36 8 L49 21 Z M65 28 L64 8 L51 21 Z" ${P} ${O}/>
    <path d="M38 22 L38.5 13 L44 19 Z M62 22 L61.5 13 L56 19 Z" fill="#8a94a3"/>
    <circle cx="50" cy="34" r="17" ${P} ${O}/>
    <ellipse cx="43" cy="32" rx="3.6" ry="4.6" fill="url(#m-light)" ${O1}/><ellipse cx="57" cy="32" rx="3.6" ry="4.6" fill="url(#m-light)" ${O1}/>
    <rect x="42.3" y="29" width="1.4" height="6" rx=".7" fill="${INK}"/><rect x="56.3" y="29" width="1.4" height="6" rx=".7" fill="${INK}"/>
    <path d="M47.5 39 L52.5 39 L50 42 Z" fill="url(#m-dark)" ${O1}/>
    <path d="M30 38 L41 40 M30 44 L41 42 M70 38 L59 40 M70 44 L59 42" stroke="${INK}" stroke-width="1.2" stroke-linecap="round"/>
    ${shine('M38 22 Q43 18 49 18 Q42 21 40 26 Z')}`,

  ship: `${shadow(38)}
    <path d="M10 80 Q20 76 30 80 Q40 84 50 80 Q60 76 70 80 Q80 84 90 80" fill="none" stroke="#8a94a3" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M50 66 V12" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M50 12 L64 16 L50 20 Z" ${P} ${O1}/>
    <path d="M54 20 Q78 38 82 62 L54 62 Z" fill="url(#m-light)" ${O}/>
    <path d="M46 26 Q30 44 24 62 L46 62 Z" fill="url(#m-light)" ${O}/>
    <path d="M12 64 L88 64 L78 82 L22 82 Z" ${P} ${O}/>
    <path d="M15.5 69 L84.5 69 L83 72 L17 72 Z" fill="#fff" opacity=".85"/>
    ${shade('M20 77 L80 77 L78 82 L22 82 Z')}
    <circle cx="34" cy="76" r="2.4" fill="#fff" ${O1}/><circle cx="50" cy="76" r="2.4" fill="#fff" ${O1}/><circle cx="66" cy="76" r="2.4" fill="#fff" ${O1}/>`,
};

export function tokenSvg(token: string, color: string, cls = 'tk'): string {
  return `<svg class="${cls}" viewBox="0 0 100 100" style="--pc:${color}" aria-hidden="true"><use href="#tok-${normalizeToken(token)}"/></svg>`;
}
