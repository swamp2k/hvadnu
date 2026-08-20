import { describe, expect, it } from 'vitest';
import {
  handleDocumentAnalysisStatusRequest,
  type WorkerEnv,
} from '../../src/server/document-analysis-endpoint';

const readyEnv: WorkerEnv = {
  ANTHROPIC_API_KEY: 'synthetic-test-key',
  ALLOWED_EMAIL: 'case-owner@example.invalid',
  DOCUMENT_ANALYSIS_ENABLED: 'true',
  PRIVATE_DEPLOYMENT_APPROVED: 'true',
  ANTHROPIC_ZDR_APPROVED: 'true',
  PAYLOAD_LOGGING_DISABLED: 'true',
};

function request(): Request {
  return new Request('https://private.example.invalid/api/analysis-status', { method: 'GET' });
}

describe('document analysis status endpoint', () => {
  it('reports available only when the verified Access identity and runtime gate are ready', async () => {
    const response = handleDocumentAnalysisStatusRequest(request(), readyEnv, 'case-owner@example.invalid');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available: true });
  });

  it('reports unavailable without exposing which runtime gate is missing', async () => {
    const { ANTHROPIC_API_KEY: _removed, ...envWithoutKey } = readyEnv;
    const response = handleDocumentAnalysisStatusRequest(request(), envWithoutKey, 'case-owner@example.invalid');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available: false });
  });

  it('does not reveal status to a different verified Access identity', async () => {
    const response = handleDocumentAnalysisStatusRequest(request(), readyEnv, 'other@example.invalid');
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ available: false });
  });
});
