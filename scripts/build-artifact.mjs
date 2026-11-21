// Собирает игру в один HTML-файл (весь JS и CSS внутри) для публикации страницей.
// Запуск: npm run build:artifact → dist/moskva-magnat.html
// Этот же файл — офлайн-версия: его можно скачать и открыть в браузере без интернета.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const js = html.match(/<script type="module" crossorigin src="\.\/(assets\/[^"]+\.js)"><\/script>/)?.[1];
const css = html.match(/<link rel="stylesheet" crossorigin href="\.\/(assets\/[^"]+\.css)">/)?.[1];
if (!js || !css) throw new Error('Не найдены JS/CSS в dist/index.html — сначала npm run build');

const code = readFileSync(join(dist, js), 'utf8').replace(/<\/script/gi, '<\\/script');
// Шрифты встраиваем прямо в файл: так он целиком работает без интернета.
const style = readFileSync(join(dist, css), 'utf8').replace(/url\(\.?\/?([^)]+\.woff2)\)/g, (_, file) => {
  const path = join(dist, 'assets', file.split('/').pop());
  return `url(data:font/woff2;base64,${readFileSync(path).toString('base64')})`;
});

const out = `<title>Москва Магнат</title>
<meta name="theme-color" content="#efedfc">
<style>${style}</style>
<div id="app"></div>
<script type="module">${code}</script>
`;
writeFileSync(join(dist, 'moskva-magnat.html'), out);
console.log(`dist/moskva-magnat.html — ${(out.length / 1024).toFixed(0)} КБ`);
