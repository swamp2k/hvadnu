import { describe, expect, it, vi } from 'vitest';
import type { DocumentAnalysisProvider } from '../../src/server/document-analysis-service';
import {
  handleDocumentAnalysisRequest,
  MAX_ANALYSIS_REQUEST_CHARACTERS,
  type ProviderFactory,
  type WorkerEnv,
} from '../../src/server/document-analysis-endpoint';
import { createAnthropicDocumentAnalysisProvider } from '../../src/server/anthropic-document-provider';

const openEnv: WorkerEnv = {
  ANTHROPIC_API_KEY: 'synthetic-test-key',
  DOCUMENT_ANALYSIS_ENABLED: 'true',
  PRIVATE_DEPLOYMENT_APPROVED: 'true',
  ANTHROPIC_ZDR_APPROVED: 'true',
  PAYLOAD_LOGGING_DISABLED: 'true',
};

const documentPayload = {
  name: 'syntetisk.txt',
  mimeType: 'text/plain',
  kind: 'text',
  sizeBytes: 80,
  pageCount: 1,
  characterCount: 42,
  pages: [{ pageNumber: 1, text: 'Dette er et syntetisk forslag, ikke en aftale.' }],
  warnings: [],
};

function request(body: string): Request {
  return new Request('https://private.example.invalid/api/analyze-document', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
}

function validProviderFactory(): ProviderFactory {
  return vi.fn((): DocumentAnalysisProvider => ({
    analyze: vi.fn(async () => ({
      title: 'Syntetisk dokument',
      documentType: 'lawyer_letter',
      sourceStatus: 'proposal',
      summary: 'Dokumentet beskriver et forslag.',
      whatItMeans: ['Forslaget er ikke i sig selv en aftale.'],
      actions: [],
      deadlines: [],
      importantPassages: [{ text: 'syntetisk forslag', locator: 'tekstblok 1' }],
      uncertainty: ['Ingen accept er dokumenteret.'],
    })),
  }));
}

describe('M2c document analysis endpoint', () => {
  it('rejects requests without a verified Cloudflare Access identity', async () => {
    const factory = validProviderFactory();
    const response = await handleDocumentAnalysisRequest(
      request(JSON.stringify(documentPayload)),
      openEnv,
      null,
      factory,
    );
    expect(response.status).toBe(401);
    expect(factory).not.toHaveBeenCalled();
  });

  it('accepts any identity already authorized by Cloudflare Access', async () => {
    const factory = validProviderFactory();
    const response = await handleDocumentAnalysisRequest(
      request(JSON.stringify(documentPayload)),
      openEnv,
      'another-authorized-user@example.invalid',
      factory,
    );
    expect(response.status).toBe(200);
    expect(factory).toHaveBeenCalledWith('synthetic-test-key');
  });

  it('keeps the provider closed when ZDR approval is missing', async () => {
    const factory = validProviderFactory();
    const response = await handleDocumentAnalysisRequest(
      request(JSON.stringify(documentPayload)),
      { ...openEnv, ANTHROPIC_ZDR_APPROVED: 'false' },
      'case-owner@example.invalid',
      factory,
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: 'analysis_unavailable' });
    expect(factory).not.toHaveBeenCalled();
  });

  it('returns validated structured analysis when every runtime gate is open', async () => {
    const factory = validProviderFactory();
    const response = await handleDocumentAnalysisRequest(
      request(JSON.stringify(documentPayload)),
      openEnv,
      'case-owner@example.invalid',
      factory,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      analysis: {
        mode: 'model_analysis',
        sourceStatus: 'proposal',
      },
    });
    expect(factory).toHaveBeenCalledWith('synthetic-test-key');
  });

  it('rejects an oversized request before provider construction', async () => {
    const factory = validProviderFactory();
    const response = await handleDocumentAnalysisRequest(
      request('x'.repeat(MAX_ANALYSIS_REQUEST_CHARACTERS + 1)),
      openEnv,
      'case-owner@example.invalid',
      factory,
    );
    expect(response.status).toBe(413);
    expect(factory).not.toHaveBeenCalled();
  });

  it('refuses to construct the real Anthropic provider without a server-side key', () => {
    expect(() => createAnthropicDocumentAnalysisProvider('   ')).toThrow(/API key is missing/u);
  });
});
