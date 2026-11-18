import type { Cell, ColorGroup } from '../engine/types';

/** Аренда улицы строится от базовой ставки. */
function rentTable(base: number): number[] {
  return [1, 5, 15, 40, 50, 60].map((m) => base * m);
}

function street(
  id: number,
  name: string,
  group: ColorGroup,
  price: number,
  base: number,
  houseCost: number,
  short?: string,
): Cell {
  return { id, type: 'property', name, short, group, price, rent: rentTable(base), houseCost };
}

export const STATION_PRICE = 2000;
export const STATION_RENT = [250, 500, 1000, 2000];
export const UTILITY_PRICE = 1500;
/** Множитель к сумме кубиков: одна или обе службы. */
export const UTILITY_MULT = [40, 100];

export const START_MONEY = 15000;
export const START_BONUS = 2000;
export const JAIL_FINE = 500;
export const JAIL_CELL = 10;
export const MAX_HOUSES = 32;
export const MAX_HOTELS = 12;

export const BOARD: Cell[] = [
  { id: 0, type: 'start', name: 'Старт' },
  street(1, 'Капотня', 'brown', 600, 40, 500),
  { id: 2, type: 'surprise', name: 'Сюрприз' },
  street(3, 'Бирюлёво', 'brown', 700, 50, 500),
  { id: 4, type: 'surprise', name: 'Сюрприз' },
  { id: 5, type: 'station', name: 'Ленинградский вокзал', short: 'Ленинградский', price: STATION_PRICE },
  street(6, 'Выхино', 'lightblue', 1000, 70, 500),
  { id: 7, type: 'chance', name: 'Шанс' },
  street(8, 'Марьино', 'lightblue', 1000, 70, 500),
  street(9, 'Митино', 'lightblue', 1200, 80, 500),
  { id: 10, type: 'jail', name: 'Тюрьма' },
  street(11, 'Сокольники', 'pink', 1400, 100, 1000),
  { id: 12, type: 'utility', name: 'Мосэнерго', price: UTILITY_PRICE },
  street(13, 'Измайлово', 'pink', 1400, 100, 1000),
  street(14, 'Таганка', 'pink', 1600, 120, 1000),
  { id: 15, type: 'station', name: 'Казанский вокзал', short: 'Казанский', price: STATION_PRICE },
  street(16, 'Красная Пресня', 'orange', 1800, 140, 1000, 'Пресня'),
  { id: 17, type: 'surprise', name: 'Сюрприз' },
  street(18, 'Хамовники', 'orange', 1800, 140, 1000),
  street(19, 'Замоскворечье', 'orange', 2000, 160, 1000),
  { id: 20, type: 'parking', name: 'Парк Горького' },
  street(21, 'Маросейка', 'red', 2200, 180, 1500),
  { id: 22, type: 'chance', name: 'Шанс' },
  street(23, 'Покровка', 'red', 2200, 180, 1500),
  street(24, 'Чистые пруды', 'red', 2400, 200, 1500),
  { id: 25, type: 'station', name: 'Киевский вокзал', short: 'Киевский', price: STATION_PRICE },
  street(26, 'Никитская', 'yellow', 2600, 220, 1500),
  street(27, 'Тверская', 'yellow', 2600, 220, 1500),
  { id: 28, type: 'utility', name: 'Мосводоканал', price: UTILITY_PRICE },
  street(29, 'Патриаршие пруды', 'yellow', 2800, 240, 1500, 'Патриаршие'),
  { id: 30, type: 'gotojail', name: 'В тюрьму!' },
  street(31, 'Остоженка', 'green', 3000, 260, 2000),
  street(32, 'Пречистенка', 'green', 3000, 260, 2000),
  { id: 33, type: 'surprise', name: 'Сюрприз' },
  street(34, 'Кутузовский проспект', 'green', 3200, 280, 2000, 'Кутузовский'),
  { id: 35, type: 'station', name: 'Белорусский вокзал', short: 'Белорусский', price: STATION_PRICE },
  { id: 36, type: 'chance', name: 'Шанс' },
  street(37, 'Москва-Сити', 'darkblue', 3500, 350, 2000),
  { id: 38, type: 'tax', name: 'Налог на роскошь', amount: 1000 },
  street(39, 'Рублёвка', 'darkblue', 4000, 500, 2000),
];

export const GROUP_COLORS: Record<ColorGroup, string> = {
  brown: '#8d5a3b',
  lightblue: '#5ec8f2',
  pink: '#e2559c',
  orange: '#f39222',
  red: '#e53935',
  yellow: '#f9d423',
  green: '#2fae5b',
  darkblue: '#2d4fc4',
};

export function groupCells(group: ColorGroup): number[] {
  return BOARD.filter((c) => c.group === group).map((c) => c.id);
}

export function isOwnable(cell: Cell): boolean {
  return cell.type === 'property' || cell.type === 'station' || cell.type === 'utility';
}
