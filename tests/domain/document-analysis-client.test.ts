import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  analyzeDocument,
  DocumentAnalysisApiError,
  getDocumentAnalysisStatus,
} from '../../src/client/document-analysis-api';
import type { ExtractedDocument } from '../../src/domain/document';

const documentFixture: ExtractedDocument = {
  name: 'syntetisk.txt',
  mimeType: 'text/plain',
  kind: 'text',
  sizeBytes: 80,
  pageCount: 1,
  characterCount: 42,
  pages: [{ pageNumber: 1, text: 'Dette er et syntetisk forslag, ikke en aftale.' }],
  warnings: [],
};

const modelAnalysis = {
  mode: 'model_analysis',
  title: 'Syntetisk dokument',
  documentType: 'lawyer_letter',
  sourceStatus: 'proposal',
  summary: 'Dokumentet beskriver et forslag.',
  whatItMeans: ['Forslaget er ikke i sig selv en aftale.'],
  actions: [],
  deadlines: [],
  importantPassages: [{ text: 'syntetisk forslag', locator: 'tekstblok 1' }],
  uncertainty: ['Ingen accept er dokumenteret.'],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('document analysis browser client', () => {
  it('reads the server capability without exposing configuration details', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ available: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })));

    await expect(getDocumentAnalysisStatus()).resolves.toEqual({ available: true });
  });

  it('fails closed when the status endpoint is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ available: false }), { status: 503 })));
    await expect(getDocumentAnalysisStatus()).resolves.toEqual({ available: false });
  });

  it('returns a validated model analysis from the same-origin endpoint', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ analysis: modelAnalysis }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await analyzeDocument(documentFixture);
    expect(result.mode).toBe('model_analysis');
    expect(result.sourceStatus).toBe('proposal');
    expect(fetchMock).toHaveBeenCalledWith('/api/analyze-document', expect.objectContaining({
      method: 'POST',
      credentials: 'same-origin',
    }));
  });

  it('rejects a synthetic/demo payload returned from the production endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      analysis: { ...modelAnalysis, mode: 'synthetic_demo' },
    }), { status: 200, headers: { 'content-type': 'application/json' } })));

    await expect(analyzeDocument(documentFixture)).rejects.toBeInstanceOf(DocumentAnalysisApiError);
  });
});
