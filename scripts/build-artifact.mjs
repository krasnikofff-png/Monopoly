// Собирает игру в один HTML-файл (весь JS и CSS внутри) для публикации страницей.
// Запуск: npm run build:artifact → dist/moskva-magnat.html
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const js = html.match(/<script type="module" crossorigin src="\.\/(assets\/[^"]+\.js)"><\/script>/)?.[1];
const css = html.match(/<link rel="stylesheet" crossorigin href="\.\/(assets\/[^"]+\.css)">/)?.[1];
if (!js || !css) throw new Error('Не найдены JS/CSS в dist/index.html — сначала npm run build');

const code = readFileSync(join(dist, js), 'utf8').replace(/<\/script/gi, '<\\/script');
const style = readFileSync(join(dist, css), 'utf8');
const fonts = html.match(/<link href="https:\/\/fonts\.googleapis\.com[^>]+>/)?.[0] ?? '';

const out = `<title>Москва Магнат</title>
<meta name="theme-color" content="#efedfc">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${fonts}
<style>${style}</style>
<div id="app"></div>
<script type="module">${code}</script>
`;
writeFileSync(join(dist, 'moskva-magnat.html'), out);
console.log(`dist/moskva-magnat.html — ${(out.length / 1024).toFixed(0)} КБ`);
