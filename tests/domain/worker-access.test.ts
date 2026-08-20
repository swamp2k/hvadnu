import { describe, expect, it } from 'vitest';
import worker from '../../src/server/worker';
import type { WorkerEnv } from '../../src/server/document-analysis-endpoint';

const readyEnv: WorkerEnv = {
  ANTHROPIC_API_KEY: 'synthetic-test-key',
  ALLOWED_EMAIL: 'case-owner@example.invalid',
  DOCUMENT_ANALYSIS_ENABLED: 'true',
  PRIVATE_DEPLOYMENT_APPROVED: 'true',
  ANTHROPIC_ZDR_APPROVED: 'true',
  PAYLOAD_LOGGING_DISABLED: 'true',
};

function statusRequest(): Request {
  return new Request('https://private.example.invalid/api/analysis-status', { method: 'GET' });
}

describe('Worker Access context boundary', () => {
  it('uses the verified ctx.access identity for analysis status', async () => {
    const response = await worker.fetch(statusRequest(), readyEnv, {
      access: {
        getIdentity: async () => ({ email: 'case-owner@example.invalid' }),
      },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available: true });
  });

  it('fails closed when the Worker has no verified Access context', async () => {
    const response = await worker.fetch(statusRequest(), readyEnv, {});
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ available: false });
  });
});
