import { DocumentExplanationSchema, type DocumentExplanation, type ExtractedDocument } from '../domain/document';

export interface DocumentAnalysisStatus {
  available: boolean;
}

export class DocumentAnalysisApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.name = 'DocumentAnalysisApiError';
    this.status = status;
    this.code = code;
  }
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function getDocumentAnalysisStatus(): Promise<DocumentAnalysisStatus> {
  try {
    const response = await fetch('/api/analysis-status', {
      method: 'GET',
      headers: { accept: 'application/json' },
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!response.ok) return { available: false };
    const body = await parseJson(response);
    return {
      available: Boolean(body && typeof body === 'object' && 'available' in body && body.available === true),
    };
  } catch {
    return { available: false };
  }
}

export async function analyzeDocument(document: ExtractedDocument): Promise<DocumentExplanation> {
  const response = await fetch('/api/analyze-document', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    cache: 'no-store',
    credentials: 'same-origin',
    body: JSON.stringify(document),
  });

  const body = await parseJson(response);
  if (!response.ok) {
    const code = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
      ? body.error
      : 'analysis_failed';
    throw new DocumentAnalysisApiError(response.status, code);
  }

  if (!body || typeof body !== 'object' || !('analysis' in body)) {
    throw new DocumentAnalysisApiError(502, 'invalid_analysis_response');
  }

  const explanation = DocumentExplanationSchema.parse(body.analysis);
  if (explanation.mode !== 'model_analysis') {
    throw new DocumentAnalysisApiError(502, 'invalid_analysis_mode');
  }
  return explanation;
}
