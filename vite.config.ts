import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The deployed app is intentionally a self-contained static site. All game
 * logic, progress tracking, hint ladders, and parent reporting run locally in
 * the browser, so GitHub Pages never receives or calls an LLM API.
 */
export default defineConfig({
  // Relative asset URLs work both locally and under a GitHub Pages repo path.
  base: './',
  plugins: [react()],
  server: { host: true },
});
