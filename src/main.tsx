import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './ui/styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/**
 * Register the offline worker in production builds only.
 *
 * Deliberately not in dev: a service worker caching module output during
 * development produces stale-code bugs that look like application bugs, and
 * costs far more time than the offline support saves on a laptop.
 */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Resolved against the *document*, not this module: the bundle lives in
    // /assets/ but sw.js is copied to the site root, and a worker's scope can
    // never be broader than its own path. Document-relative also keeps it
    // correct under a GitHub Pages sub-path.
    const swUrl = new URL('sw.js', document.baseURI).href;
    void navigator.serviceWorker.register(swUrl).catch(() => {
      // Offline support is a bonus; failing to register must never be fatal.
    });
  });
}
