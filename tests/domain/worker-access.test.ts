import { describe, expect, it, vi } from 'vitest';
import { createWorker, verifyClassicAccessJwt } from '../../src/server/worker';
import type { WorkerEnv } from '../../src/server/document-analysis-endpoint';

const readyEnv: WorkerEnv = {
  ANTHROPIC_API_KEY: 'synthetic-test-key',
  DOCUMENT_ANALYSIS_ENABLED: 'true',
  TEAM_DOMAIN: 'https://hadus.cloudflareaccess.com',
  POLICY_AUD: 'synthetic-policy-audience',
};

function statusRequest(headers?: HeadersInit): Request {
  const init: RequestInit = { method: 'GET' };
  if (headers) init.headers = headers;
  return new Request('https://private.example.invalid/api/analysis-status', init);
}

describe('Worker Access context boundary', () => {
  it('accepts an identity already authorized by Worker-native Cloudflare Access', async () => {
    const verifyJwt = vi.fn();
    const worker = createWorker(verifyJwt);
    const response = await worker.fetch(statusRequest(), readyEnv, {
      access: { getIdentity: async () => ({ email: 'authorized-user@example.invalid' }) },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available: true });
    expect(verifyJwt).not.toHaveBeenCalled();
  });

  it('accepts classic Access only after the assertion is verified for this app', async () => {
    const verifyJwt = vi.fn(async (token: string, env: WorkerEnv) => {
      expect(token).toBe('synthetic-access-assertion');
      expect(env.TEAM_DOMAIN).toBe('https://hadus.cloudflareaccess.com');
      expect(env.POLICY_AUD).toBe('synthetic-policy-audience');
      return 'classic-user@example.invalid';
    });
    const worker = createWorker(verifyJwt);
    const response = await worker.fetch(statusRequest({
      'cf-access-jwt-assertion': 'synthetic-access-assertion',
    }), readyEnv, {});

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available: true });
    expect(verifyJwt).toHaveBeenCalledOnce();
  });

  it('fails closed when neither Worker-native nor classic Access proof is present', async () => {
    const verifyJwt = vi.fn();
    const worker = createWorker(verifyJwt);
    const response = await worker.fetch(statusRequest(), readyEnv, {});
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ available: false });
    expect(verifyJwt).not.toHaveBeenCalled();
  });

  it('fails closed when classic Access JWT verification rejects the assertion', async () => {
    const verifyJwt = vi.fn(async () => null);
    const worker = createWorker(verifyJwt);
    const response = await worker.fetch(statusRequest({
      'cf-access-jwt-assertion': 'invalid-access-assertion',
    }), readyEnv, {});
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ available: false });
  });

  it('fails closed when Worker-native Access ran but no identity can be resolved', async () => {
    const verifyJwt = vi.fn(async () => 'must-not-be-used@example.invalid');
    const worker = createWorker(verifyJwt);
    const response = await worker.fetch(statusRequest({
      'cf-access-jwt-assertion': 'synthetic-access-assertion',
    }), readyEnv, { access: { getIdentity: async () => null } });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ available: false });
    expect(verifyJwt).not.toHaveBeenCalled();
  });

  it('fails closed before JWKS lookup when classic Access app metadata is missing', async () => {
    expect(await verifyClassicAccessJwt('synthetic-token', {})).toBeNull();
    expect(await verifyClassicAccessJwt('synthetic-token', {
      TEAM_DOMAIN: 'http://not-https.example.invalid',
      POLICY_AUD: 'aud',
    })).toBeNull();
  });
});
