// Фишки игроков: хромированные фигурки (картинки), стоят на кружке цвета игрока.
import carImg from './tokens/car.webp';
import catImg from './tokens/cat.webp';
import dogImg from './tokens/dog.webp';
import duckImg from './tokens/duck.webp';
import rocketImg from './tokens/rocket.webp';
import tramImg from './tokens/tram.webp';

/** Градиенты металла (подключаются в installIcons; ими нарисованы некоторые значки клеток). */
export const TOKEN_GRADIENTS = [
  `<linearGradient id="m-body" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".3" stop-color="#cfd5de"/><stop offset=".55" stop-color="#8e98a7"/><stop offset=".75" stop-color="#dde2e9"/><stop offset="1" stop-color="#6b7482"/></linearGradient>`,
  `<linearGradient id="m-light" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#e3e7ed"/><stop offset="1" stop-color="#aab2bf"/></linearGradient>`,
  `<linearGradient id="m-dark" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9aa3b1"/><stop offset=".6" stop-color="#5f6877"/><stop offset="1" stop-color="#3c434e"/></linearGradient>`,
].join('');

export const TOKEN_IDS = ['car', 'duck', 'dog', 'rocket', 'cat', 'tram'] as const;
export type TokenId = (typeof TOKEN_IDS)[number];

export const TOKEN_NAMES: Record<TokenId, string> = {
  car: 'Машинка',
  duck: 'Утка',
  dog: 'Пёс в ушанке',
  rocket: 'Ракета',
  cat: 'Кот',
  tram: 'Трамвай',
};

const TOKEN_IMAGES: Record<TokenId, string> = {
  car: carImg,
  duck: duckImg,
  dog: dogImg,
  rocket: rocketImg,
  cat: catImg,
  tram: tramImg,
};

/** Старые сохранения: эмодзи и прежние фишки (цилиндр → утка, кораблик → трамвай). */
const LEGACY: Record<string, TokenId> = {
  '🚗': 'car',
  '🎩': 'duck',
  '🐶': 'dog',
  '🚀': 'rocket',
  '🐱': 'cat',
  '⛵': 'tram',
  hat: 'duck',
  ship: 'tram',
};

export function normalizeToken(t: string): TokenId {
  if ((TOKEN_IDS as readonly string[]).includes(t)) return t as TokenId;
  return LEGACY[t] ?? 'car';
}

export function tokenSvg(token: string, color: string, cls = 'tk'): string {
  const id = normalizeToken(token);
  return `<img class="${cls}" src="${TOKEN_IMAGES[id]}" alt="" draggable="false" style="--pc:${color}" aria-hidden="true">`;
}
