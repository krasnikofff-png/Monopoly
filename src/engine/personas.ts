// Характеры ботов. У каждого — своё имя, чтобы игроки знали, с кем играют.

import type { ColorGroup } from './types';

export interface Persona {
  id: string;
  name: string;
  /** Имя на поле и в сообщениях. */
  short: string;
  emoji: string;
  /** Короткая характеристика: «Новичок», «Торгаш»… */
  title: string;
  /** Сложность: 1 — лёгкий, 2 — средний, 3 — сложный. */
  level: 1 | 2 | 3;
  about: string;

  /** Сколько денег бот старается держать про запас. */
  reserve: number;
  /** Покупка клетки: smart — с оглядкой на запас, all — всё, на что хватает, random — как повезёт. */
  buy: 'smart' | 'all' | 'random';
  /** Предел ставки на аукционе в долях цены: обычная клетка, помешать сопернику, своя монополия. */
  auction: [number, number, number];
  /** Сколько оставлять после постройки дома. */
  buildReserve: number;
  /** Максимум построек на улице (5 — отель). */
  maxHouses: number;
  /** Порядок застройки: дорогие улицы, лучшие по отдаче или дешёвые. */
  buildOrder: 'expensive' | 'value' | 'cheap';
  /** Придерживает дома: не строит отели, когда в банке мало домов. */
  hoard: boolean;
  /** Выкупает залог, если после выкупа останется столько. */
  unmortgageReserve: number;
  /** Тюрьма: early — выходит в начале игры, always — всегда платит, never — сидит, smart — по ситуации, random. */
  jail: 'early' | 'always' | 'never' | 'smart' | 'random';
  /** Сколько своих предложений обмена за ход (0 — не предлагает). */
  trades: number;
  /** Насколько «наглым» делает первое предложение (₽ ниже справедливого). */
  lowball: number;
  /** Сколько готов доплатить сверх минимума, лишь бы сделка прошла. */
  overpay: number;
  /** Насколько боится чужих монополий при обмене (0 — не замечает). */
  theirWeight: number;
  /** Какую выгоду хочет получить, чтобы принять чужое предложение (может быть < 0). */
  acceptMargin: number;
  /** Знает, на какие улицы чаще встают. */
  landingAware: boolean;
  /** Доля случайности в решениях (0 — полностью предсказуем). */
  noise: number;
}

export const PERSONAS: Persona[] = [
  {
    id: 'petya',
    name: 'Студент Петя',
    short: 'Петя',
    emoji: '🎒',
    title: 'Новичок',
    level: 1,
    about: 'Только учится. Покупает что попало, строит мало, легко соглашается на обмен — может отдать вам монополию и не заметить.',
    reserve: 800,
    buy: 'random',
    auction: [0.6, 0.6, 0.9],
    buildReserve: 800,
    maxHouses: 2,
    buildOrder: 'cheap',
    hoard: false,
    unmortgageReserve: 2500,
    jail: 'always',
    trades: 0,
    lowball: 0,
    overpay: 0,
    theirWeight: 0,
    acceptMargin: -400,
    landingAware: false,
    noise: 0.3,
  },
  {
    id: 'mikhalych',
    name: 'Таксист Михалыч',
    short: 'Михалыч',
    emoji: '🚕',
    title: 'Середнячок',
    level: 2,
    about: 'Играет ровно и без сюрпризов: держит запас, собирает монополии, строит на самых дорогих улицах. Хороший соперник для первых партий.',
    reserve: 1500,
    buy: 'smart',
    auction: [0.8, 1.1, 1.4],
    buildReserve: 1500,
    maxHouses: 5,
    buildOrder: 'expensive',
    hoard: false,
    unmortgageReserve: 3000,
    jail: 'early',
    trades: 1,
    lowball: 0,
    overpay: 0,
    theirWeight: 0.8,
    acceptMargin: 0,
    landingAware: false,
    noise: 0,
  },
  {
    id: 'semenych',
    name: 'Бухгалтер Семёныч',
    short: 'Семёныч',
    emoji: '🧮',
    title: 'Осторожный',
    level: 2,
    about: 'Копит деньги и почти никогда не влезает в долги. Строит не больше трёх домов, из тюрьмы не спешит. Медленно разгоняется, но его трудно разорить.',
    reserve: 3500,
    buy: 'smart',
    auction: [0.6, 0.9, 1.2],
    buildReserve: 3500,
    maxHouses: 3,
    buildOrder: 'value',
    hoard: false,
    unmortgageReserve: 5000,
    jail: 'never',
    trades: 1,
    lowball: 0,
    overpay: 0,
    theirWeight: 1.3,
    acceptMargin: 800,
    landingAware: false,
    noise: 0,
  },
  {
    id: 'vadim',
    name: 'Застройщик Вадим',
    short: 'Вадим',
    emoji: '🏗️',
    title: 'Агрессивный',
    level: 2,
    about: 'Скупает всё подряд и ставит отели при первой возможности. Щедро доплачивает за нужные улицы. Опасен с монополией, но часто сидит без денег.',
    reserve: 300,
    buy: 'all',
    auction: [1.0, 1.3, 1.8],
    buildReserve: 300,
    maxHouses: 5,
    buildOrder: 'expensive',
    hoard: false,
    unmortgageReserve: 1500,
    jail: 'early',
    trades: 1,
    lowball: 0,
    overpay: 1000,
    theirWeight: 0.6,
    acceptMargin: 0,
    landingAware: false,
    noise: 0,
  },
  {
    id: 'leva',
    name: 'Торговец Лёва',
    short: 'Лёва',
    emoji: '🤝',
    title: 'Торгаш',
    level: 3,
    about: 'Постоянно предлагает обмены: начинает с наглых условий и каждый раз чуть добавляет. Ваши предложения принимает, только если сам сильно выигрывает.',
    reserve: 1500,
    buy: 'smart',
    auction: [0.8, 1.2, 1.5],
    buildReserve: 1500,
    maxHouses: 5,
    buildOrder: 'expensive',
    hoard: false,
    unmortgageReserve: 3000,
    jail: 'early',
    trades: 3,
    lowball: 2000,
    overpay: 0,
    theirWeight: 1.0,
    acceptMargin: 1000,
    landingAware: false,
    noise: 0,
  },
  {
    id: 'professor',
    name: 'Профессор',
    short: 'Профессор',
    emoji: '🎓',
    title: 'Стратег',
    level: 3,
    about: 'Знает теорию: чаще всего встают на оранжевые и красные улицы — за них и бьётся. Строит по три дома, придерживает дома, чтобы вам не досталось, а в конце игры отсиживается в тюрьме.',
    reserve: 1500,
    buy: 'smart',
    auction: [1.0, 1.4, 1.8],
    buildReserve: 1200,
    maxHouses: 5,
    buildOrder: 'value',
    hoard: true,
    unmortgageReserve: 3500,
    jail: 'smart',
    trades: 1,
    lowball: 500,
    overpay: 0,
    theirWeight: 1.0,
    acceptMargin: 0,
    landingAware: true,
    noise: 0,
  },
  {
    id: 'zhanna',
    name: 'Азартная Жанна',
    short: 'Жанна',
    emoji: '🎰',
    title: 'Непредсказуемая',
    level: 2,
    about: 'Решает по настроению: может сильно переплатить на аукционе или пропустить отличную улицу. Никогда не знаешь, что она выкинет.',
    reserve: 1000,
    buy: 'random',
    auction: [0.9, 1.2, 1.6],
    buildReserve: 1000,
    maxHouses: 5,
    buildOrder: 'expensive',
    hoard: false,
    unmortgageReserve: 2500,
    jail: 'random',
    trades: 1,
    lowball: 500,
    overpay: 500,
    theirWeight: 0.7,
    acceptMargin: 0,
    landingAware: false,
    noise: 0.5,
  },
];

export const DEFAULT_PERSONA = 'mikhalych';

export function getPersona(id: string | undefined): Persona {
  return PERSONAS.find((p) => p.id === id) ?? PERSONAS.find((p) => p.id === DEFAULT_PERSONA)!;
}

/** Насколько часто встают на улицы группы (относительно среднего). */
export const GROUP_TRAFFIC: Record<ColorGroup, number> = {
  brown: 0.8,
  lightblue: 0.95,
  pink: 1.05,
  orange: 1.25,
  red: 1.2,
  yellow: 1.1,
  green: 1.0,
  darkblue: 0.95,
};

export const LEVEL_NAMES = ['', 'лёгкий', 'средний', 'сложный'];
