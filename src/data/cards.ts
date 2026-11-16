import type { Card } from '../engine/types';

export const CARDS: Card[] = [
  // ——— Шанс ———
  { id: 'c1', deck: 'chance', text: 'Отправляйся на Старт и получи бонус.', effect: { kind: 'moveTo', cell: 0 } },
  { id: 'c2', deck: 'chance', text: 'Прогулка по Рублёвке. Иди туда.', effect: { kind: 'moveTo', cell: 39 } },
  { id: 'c3', deck: 'chance', text: 'Встреча на Чистых прудах. Иди туда.', effect: { kind: 'moveTo', cell: 24 } },
  { id: 'c4', deck: 'chance', text: 'Билет на поезд. Иди на Ленинградский вокзал.', effect: { kind: 'moveTo', cell: 5 } },
  { id: 'c5', deck: 'chance', text: 'Едешь к ближайшему вокзалу. Если он чей-то — плати двойную аренду.', effect: { kind: 'nearest', target: 'station' } },
  { id: 'c6', deck: 'chance', text: 'Свет отключили! Иди к ближайшей службе. Если она чья-то — плати 10× сумму кубиков.', effect: { kind: 'nearest', target: 'utility' } },
  { id: 'c7', deck: 'chance', text: 'Пробка на Садовом. Вернись на 3 клетки назад.', effect: { kind: 'moveBy', steps: -3 } },
  { id: 'c8', deck: 'chance', text: 'Тебя поймали без билета в метро. Отправляйся в тюрьму.', effect: { kind: 'gotojail' } },
  { id: 'c9', deck: 'chance', text: 'Знакомый адвокат. Выйди из тюрьмы бесплатно.', effect: { kind: 'jailfree' } },
  { id: 'c10', deck: 'chance', text: 'Капремонт подъездов: 250 за каждый дом и 1000 за каждый отель.', effect: { kind: 'repairs', perHouse: 250, perHotel: 1000 } },
  { id: 'c11', deck: 'chance', text: 'Штраф за превышение скорости на МКАДе: −150.', effect: { kind: 'money', amount: -150 } },
  { id: 'c12', deck: 'chance', text: 'Тебя выбрали старостой дома. Заплати каждому игроку по 500.', effect: { kind: 'payEach', amount: 500 } },
  { id: 'c13', deck: 'chance', text: 'Дивиденды от стартапа в Сколково: +500.', effect: { kind: 'money', amount: 500 } },
  { id: 'c14', deck: 'chance', text: 'Кредит на квартиру одобрен: +1500.', effect: { kind: 'money', amount: 1500 } },

  // ——— Сюрприз ———
  { id: 's1', deck: 'surprise', text: 'Отправляйся на Старт и получи бонус.', effect: { kind: 'moveTo', cell: 0 } },
  { id: 's2', deck: 'surprise', text: 'Ошибка банка в твою пользу: +2000.', effect: { kind: 'money', amount: 2000 } },
  { id: 's3', deck: 'surprise', text: 'Визит к стоматологу: −500.', effect: { kind: 'money', amount: -500 } },
  { id: 's4', deck: 'surprise', text: 'Продал старый велосипед на Авито: +500.', effect: { kind: 'money', amount: 500 } },
  { id: 's5', deck: 'surprise', text: 'Друг вернул долг. Выйди из тюрьмы бесплатно.', effect: { kind: 'jailfree' } },
  { id: 's6', deck: 'surprise', text: 'Камера зафиксировала нарушение. Отправляйся в тюрьму.', effect: { kind: 'gotojail' } },
  { id: 's7', deck: 'surprise', text: 'Новоселье! Каждый игрок дарит тебе по 100.', effect: { kind: 'collectFromEach', amount: 100 } },
  { id: 's8', deck: 'surprise', text: 'Возврат налогового вычета: +200.', effect: { kind: 'money', amount: 200 } },
  { id: 's9', deck: 'surprise', text: 'Страховка за помятую машину: +1000.', effect: { kind: 'money', amount: 1000 } },
  { id: 's10', deck: 'surprise', text: 'Оплата больничного: −1000.', effect: { kind: 'money', amount: -1000 } },
  { id: 's11', deck: 'surprise', text: 'Оплата обучения: −500.', effect: { kind: 'money', amount: -500 } },
  { id: 's12', deck: 'surprise', text: 'Гонорар за консультацию: +250.', effect: { kind: 'money', amount: 250 } },
  { id: 's13', deck: 'surprise', text: 'Ремонт дороги у дома: 400 за каждый дом и 1150 за каждый отель.', effect: { kind: 'repairs', perHouse: 400, perHotel: 1150 } },
  { id: 's14', deck: 'surprise', text: 'Выиграл второе место в конкурсе красоты: +100.', effect: { kind: 'money', amount: 100 } },
  { id: 's15', deck: 'surprise', text: 'Наследство от тёти из Саратова: +1000.', effect: { kind: 'money', amount: 1000 } },
];

export const CARD_BY_ID: Record<string, Card> = Object.fromEntries(CARDS.map((c) => [c.id, c]));
