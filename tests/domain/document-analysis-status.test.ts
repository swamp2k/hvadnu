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

function request(email = 'case-owner@example.invalid'): Request {
  return new Request('https://private.example.invalid/api/analysis-status', {
    method: 'GET',
    headers: { 'cf-access-authenticated-user-email': email },
  });
}

describe('document analysis status endpoint', () => {
  it('reports available only when the authorized runtime gate is fully open', async () => {
    const response = handleDocumentAnalysisStatusRequest(request(), readyEnv);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available: true });
  });

  it('reports unavailable without exposing which runtime gate is missing', async () => {
    const response = handleDocumentAnalysisStatusRequest(request(), {
      ...readyEnv,
      ANTHROPIC_API_KEY: undefined,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available: false });
  });

  it('does not reveal status to a different Access identity', async () => {
    const response = handleDocumentAnalysisStatusRequest(request('other@example.invalid'), readyEnv);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ available: false });
  });
});
