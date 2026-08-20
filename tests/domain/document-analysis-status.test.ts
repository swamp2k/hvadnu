import { describe, expect, it } from 'vitest';
import {
  handleDocumentAnalysisStatusRequest,
  type WorkerEnv,
} from '../../src/server/document-analysis-endpoint';

const readyEnv: WorkerEnv = {
  ANTHROPIC_API_KEY: 'synthetic-test-key',
  DOCUMENT_ANALYSIS_ENABLED: 'true',
};

function request(): Request {
  return new Request('https://private.example.invalid/api/analysis-status', { method: 'GET' });
}

describe('document analysis status endpoint', () => {
  it('reports available when Access authenticated the request and AI is configured', async () => {
    const response = handleDocumentAnalysisStatusRequest(request(), readyEnv, 'authorized-user@example.invalid');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available: true });
  });

  it('reports unavailable without exposing which runtime dependency is missing', async () => {
    const { ANTHROPIC_API_KEY: _removed, ...envWithoutKey } = readyEnv;
    const response = handleDocumentAnalysisStatusRequest(request(), envWithoutKey, 'authorized-user@example.invalid');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available: false });
  });

  it('does not reveal status without a verified Access identity', async () => {
    const response = handleDocumentAnalysisStatusRequest(request(), readyEnv, null);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ available: false });
  });
});
