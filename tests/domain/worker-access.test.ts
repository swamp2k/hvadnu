import { describe, expect, it, vi } from 'vitest';
import { createWorker } from '../../src/server/worker';
import type { WorkerEnv } from '../../src/server/document-analysis-endpoint';

const readyEnv: WorkerEnv = {
  ANTHROPIC_API_KEY: 'synthetic-test-key',
  DOCUMENT_ANALYSIS_ENABLED: 'true',
  PRIVATE_DEPLOYMENT_APPROVED: 'true',
  ANTHROPIC_ZDR_APPROVED: 'true',
  PAYLOAD_LOGGING_DISABLED: 'true',
};

function statusRequest(headers?: HeadersInit): Request {
  const init: RequestInit = { method: 'GET' };
  if (headers) init.headers = headers;
  return new Request('https://private.example.invalid/api/analysis-status', init);
}

describe('Worker Access context boundary', () => {
  it('accepts an identity already authorized by Worker-native Cloudflare Access', async () => {
    const fallbackFetch = vi.fn();
    const worker = createWorker(fallbackFetch);
    const response = await worker.fetch(statusRequest(), readyEnv, {
      access: {
        getIdentity: async () => ({ email: 'authorized-user@example.invalid' }),
      },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available: true });
    expect(fallbackFetch).not.toHaveBeenCalled();
  });

  it('accepts a legacy hostname Access assertion only after Access validates it', async () => {
    const fallbackFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      expect(url).toBe('https://private.example.invalid/cdn-cgi/access/get-identity');
      expect(new Headers(init?.headers).get('cookie')).toBe('CF_Authorization=synthetic-access-assertion');
      return Response.json({ email: 'legacy-user@example.invalid' });
    });
    const worker = createWorker(fallbackFetch);
    const response = await worker.fetch(statusRequest({
      'cf-access-jwt-assertion': 'synthetic-access-assertion',
    }), readyEnv, {});

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available: true });
    expect(fallbackFetch).toHaveBeenCalledOnce();
  });

  it('fails closed when neither Worker-native nor legacy Access proof is present', async () => {
    const fallbackFetch = vi.fn();
    const worker = createWorker(fallbackFetch);
    const response = await worker.fetch(statusRequest(), readyEnv, {});
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ available: false });
    expect(fallbackFetch).not.toHaveBeenCalled();
  });

  it('fails closed when legacy Access rejects the current assertion', async () => {
    const fallbackFetch = vi.fn(async () => new Response('Unauthorized', { status: 401 }));
    const worker = createWorker(fallbackFetch);
    const response = await worker.fetch(statusRequest({
      'cf-access-jwt-assertion': 'invalid-access-assertion',
    }), readyEnv, {});

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ available: false });
  });

  it('fails closed when Worker-native Access ran but no identity can be resolved', async () => {
    const fallbackFetch = vi.fn();
    const worker = createWorker(fallbackFetch);
    const response = await worker.fetch(statusRequest({
      'cf-access-jwt-assertion': 'synthetic-access-assertion',
    }), readyEnv, {
      access: { getIdentity: async () => null },
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ available: false });
    expect(fallbackFetch).not.toHaveBeenCalled();
  });
});
