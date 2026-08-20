import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { PRELOAD_RELOAD_KEY, shouldReloadAfterPreloadError } from './preload-recovery';
import './styles.css';
import './documents.css';
import './message-history.css';

window.addEventListener('vite:preloadError', (event) => {
  const now = Date.now();
  if (!shouldReloadAfterPreloadError(window.sessionStorage.getItem(PRELOAD_RELOAD_KEY), now)) return;

  event.preventDefault();
  window.sessionStorage.setItem(PRELOAD_RELOAD_KEY, String(now));
  window.location.reload();
});

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// A successful fresh boot clears the loop guard so a later deployment can recover too.
window.setTimeout(() => window.sessionStorage.removeItem(PRELOAD_RELOAD_KEY), 5_000);
