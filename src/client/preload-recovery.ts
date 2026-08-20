export const PRELOAD_RELOAD_KEY = 'hvadnu:preload-reload-at';
export const PRELOAD_RELOAD_WINDOW_MS = 30_000;

export function shouldReloadAfterPreloadError(lastReloadAt: string | null, now = Date.now()): boolean {
  if (!lastReloadAt) return true;
  const previous = Number(lastReloadAt);
  if (!Number.isFinite(previous) || previous <= 0) return true;
  return now - previous > PRELOAD_RELOAD_WINDOW_MS;
}
