import { describe, expect, it } from 'vitest';
import {
  PRELOAD_RELOAD_WINDOW_MS,
  shouldReloadAfterPreloadError,
} from '../../src/client/preload-recovery';

describe('stale Vite chunk recovery', () => {
  it('reloads when no prior recovery attempt exists', () => {
    expect(shouldReloadAfterPreloadError(null, 100_000)).toBe(true);
  });

  it('does not reload-loop when a second preload error happens immediately', () => {
    expect(shouldReloadAfterPreloadError('100000', 100_000 + PRELOAD_RELOAD_WINDOW_MS - 1)).toBe(false);
  });

  it('allows recovery again after the loop window', () => {
    expect(shouldReloadAfterPreloadError('100000', 100_000 + PRELOAD_RELOAD_WINDOW_MS + 1)).toBe(true);
  });
});
