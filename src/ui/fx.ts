// Визуальные эффекты поверх интерфейса: летящие монеты, конфетти, всплывающие суммы.
// Живут в отдельном слое в <body>, поэтому не пропадают при перерисовке экрана.

const COIN_SVG = `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="#f5b83d" stroke="#8a5a00" stroke-width="2.5"/><circle cx="20" cy="20" r="13" fill="#ffd862" stroke="#c88a12" stroke-width="1.5"/><text x="20" y="26.5" text-anchor="middle" font-size="17" font-weight="800" fill="#8a5a00" font-family="Rubik, sans-serif">₽</text></svg>`;

function layer(): HTMLElement {
  let el = document.getElementById('fx');
  if (!el) {
    el = document.createElement('div');
    el.id = 'fx';
    document.body.appendChild(el);
  }
  return el;
}

const center = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

/** Монеты летят дугой из одной точки в другую. Возвращает промис по прилёту первой. */
export function flyCoins(from: DOMRect, to: DOMRect, count: number): Promise<void> {
  const a = center(from);
  const b = center(to);
  const host = layer();
  let first: Promise<void> | null = null;
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'fx-coin';
    el.innerHTML = COIN_SVG;
    el.style.left = `${a.x - 11}px`;
    el.style.top = `${a.y - 11}px`;
    host.appendChild(el);
    const jx = (Math.random() - 0.5) * 40;
    const jy = (Math.random() - 0.5) * 30;
    const lift = -60 - Math.random() * 40;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const anim = el.animate(
      [
        { transform: 'translate(0,0) scale(.4)', opacity: 0 },
        { transform: `translate(${jx}px,${jy}px) scale(1)`, opacity: 1, offset: 0.15 },
        { transform: `translate(${dx * 0.5 + jx}px,${dy * 0.5 + lift}px) scale(1.1)`, offset: 0.55 },
        { transform: `translate(${dx}px,${dy}px) scale(.6)`, opacity: 0.9 },
      ],
      { duration: 620, delay: i * 55, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'both' },
    );
    const done = anim.finished.then(() => el.remove());
    if (!first) first = done.then(() => undefined);
  }
  return first ?? Promise.resolve();
}

/** Всплывающая сумма возле элемента. */
export function floatText(at: DOMRect, text: string, cls: string): void {
  const p = center(at);
  const el = document.createElement('div');
  el.className = `fx-float ${cls}`;
  el.textContent = text;
  el.style.left = `${p.x}px`;
  el.style.top = `${at.bottom - 4}px`;
  layer().appendChild(el);
  el.animate(
    [
      { transform: 'translate(-50%, 0) scale(.6)', opacity: 0 },
      { transform: 'translate(-50%, 6px) scale(1.2)', opacity: 1, offset: 0.2 },
      { transform: 'translate(-50%, 26px) scale(1)', opacity: 0 },
    ],
    { duration: 1300, easing: 'ease-out' },
  ).finished.then(() => el.remove());
}

/** Хлопушка конфетти из точки. */
export function confetti(at: DOMRect, colors: string[], count = 26, power = 1): void {
  const p = center(at);
  const host = layer();
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'fx-confetti';
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
    el.style.background = colors[i % colors.length];
    if (i % 3 === 0) el.style.borderRadius = '50%';
    host.appendChild(el);
    const ang = Math.random() * Math.PI * 2;
    const dist = (50 + Math.random() * 90) * power;
    const dx = Math.cos(ang) * dist;
    const dy = Math.sin(ang) * dist - 40 * power;
    const rot = (Math.random() - 0.5) * 720;
    el.animate(
      [
        { transform: 'translate(-50%,-50%) scale(.3)', opacity: 1 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${rot / 2}deg)`, opacity: 1, offset: 0.45 },
        { transform: `translate(calc(-50% + ${dx * 1.2}px), calc(-50% + ${dy + 120 * power}px)) rotate(${rot}deg)`, opacity: 0 },
      ],
      { duration: 1000 + Math.random() * 500, easing: 'cubic-bezier(.2,.7,.4,1)' },
    ).finished.then(() => el.remove());
  }
}

/** Встряска элемента (тюрьма, банкротство). */
export function shake(el: Element | null, strength = 6): void {
  el?.animate(
    [0, -1, 1, -1, 1, -0.5, 0].map((k) => ({ transform: `translateX(${k * strength}px)` })),
    { duration: 420, easing: 'ease-out' },
  );
}

/** Плавное изменение числа (счётчик денег). */
export function tweenNumber(from: number, to: number, ms: number, onStep: (v: number) => void): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      onStep(Math.round(from + (to - from) * e));
      if (k < 1) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
}
