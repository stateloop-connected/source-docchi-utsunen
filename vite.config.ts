import { defineConfig } from 'vitest/config';

// コンテナ内では node_modules が読み取り専用なので、キャッシュの置き場を環境変数で /tmp に逃がす
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

export default defineConfig({
  // GitHub Pages などのサブパスにそのまま置けるようにする（仕様書 1 章）
  base: './',
  cacheDir: env.VITE_CACHE_DIR,
  build: { target: 'es2022' },
  server: {
    // Windows のバインドマウントではファイル変更の通知が届かないので、コンテナ内ではポーリングする
    watch: env.VITE_POLL ? { usePolling: true, interval: 300 } : undefined,
  },
  test: { include: ['tests/**/*.test.ts'] },
});
