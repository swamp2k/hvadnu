import { CaseSnapshotSchema, type CaseSnapshot } from '../domain/case-state';
import { DocumentExplanationSchema, ExtractedDocumentSchema, type DocumentExplanation, type ExtractedDocument } from '../domain/document';

export class CaseApiError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super(code);
    this.name = 'CaseApiError';
  }
}

async function parseError(response: Response): Promise<never> {
  let code = 'case_api_error';
  try {
    const body = await response.json() as { error?: unknown };
    if (typeof body.error === 'string') code = body.error;
  } catch {
    // Keep generic error code. Never surface raw response bodies from persistence APIs.
  }
  throw new CaseApiError(response.status, code);
}

export async function getCaseSnapshot(fetchImpl: typeof fetch = fetch): Promise<CaseSnapshot> {
  const response = await fetchImpl('/api/case', { method: 'GET', credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) return parseError(response);
  const body = await response.json() as { snapshot?: unknown };
  return CaseSnapshotSchema.parse(body.snapshot);
}

export async function saveAnalyzedDocumentToCase(
  document: ExtractedDocument,
  explanation: DocumentExplanation,
  fetchImpl: typeof fetch = fetch,
): Promise<{ sourceId: string; eventId: string }> {
  ExtractedDocumentSchema.parse(document);
  DocumentExplanationSchema.parse(explanation);
  if (explanation.mode !== 'model_analysis') throw new CaseApiError(400, 'model_analysis_required');

  const response = await fetchImpl('/api/case/import-document', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ document, explanation }),
  });
  if (!response.ok) return parseError(response);
  const body = await response.json() as { sourceId?: unknown; eventId?: unknown };
  if (typeof body.sourceId !== 'string' || typeof body.eventId !== 'string') throw new CaseApiError(502, 'invalid_case_response');
  return { sourceId: body.sourceId, eventId: body.eventId };
}

export async function exportCase(fetchImpl: typeof fetch = fetch): Promise<unknown> {
  const response = await fetchImpl('/api/case/export', { method: 'GET', credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) return parseError(response);
  return response.json();
}

export async function deleteCase(fetchImpl: typeof fetch = fetch): Promise<void> {
  const response = await fetchImpl('/api/case/delete', { method: 'DELETE', credentials: 'same-origin' });
  if (!response.ok) return parseError(response);
}
