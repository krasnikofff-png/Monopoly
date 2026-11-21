import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/** Все файлы сборки (кроме самого воркера и одностраничной версии). */
function listFiles(dir: string, root = dir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return listFiles(p, root);
    const rel = relative(root, p).split('\\').join('/');
    return rel === 'sw.js' || rel === 'moskva-magnat.html' ? [] : [rel];
  });
}

/**
 * Сервис-воркер для игры без интернета: после первого открытия все файлы игры лежат
 * в кэше телефона. Версия кэша — хэш содержимого, поэтому новая сборка подтягивается сама.
 */
function offlineWorker(): Plugin {
  return {
    name: 'offline-worker',
    apply: 'build',
    closeBundle() {
      const dist = 'dist';
      const files = listFiles(dist);
      const hash = createHash('sha256');
      for (const f of files) hash.update(f).update(readFileSync(join(dist, f)));
      const version = hash.digest('hex').slice(0, 12);
      const urls = ['./', ...files.map((f) => `./${f}`)];
      const src = readFileSync('src/sw-template.js', 'utf8')
        .replace('__VERSION__', version)
        .replace('__FILES__', JSON.stringify(urls));
      writeFileSync(join(dist, 'sw.js'), src);
    },
  };
}

export default defineConfig({
  base: './',
  build: { target: 'es2020' },
  plugins: [offlineWorker()],
});
