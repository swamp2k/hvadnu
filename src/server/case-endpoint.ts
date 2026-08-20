import { z } from 'zod';
import { DocumentExplanationSchema, ExtractedDocumentSchema } from '../domain/document';
import { D1CaseRepository } from '../storage/d1-case-repository';
import type { D1Database } from '../storage/d1-types';
import { MAX_ANALYSIS_REQUEST_CHARACTERS, isAuthenticatedAccessIdentity } from './document-analysis-endpoint';

const ImportDocumentSchema = z.object({
  document: ExtractedDocumentSchema,
  explanation: DocumentExplanationSchema.refine((value) => value.mode === 'model_analysis', {
    message: 'Only production model analyses may be persisted.',
  }),
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function sourceTextLength(document: z.infer<typeof ExtractedDocumentSchema>): number {
  return document.pages.map((page) => page.text).join('\n\n').length;
}

export async function handleCaseSnapshotRequest(
  request: Request,
  db: D1Database | undefined,
  authenticatedEmail: string | null | undefined,
): Promise<Response> {
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
  if (!isAuthenticatedAccessIdentity(authenticatedEmail)) return json({ error: 'unauthorized' }, 401);
  if (!db) return json({ error: 'persistence_unavailable' }, 503);

  try {
    return json({ snapshot: await new D1CaseRepository(db).getSnapshot() });
  } catch (error) {
    const name = error instanceof Error ? error.name : 'UnknownError';
    return json({ error: 'case_read_failed', errorType: name }, 502);
  }
}

export async function handleCaseImportDocumentRequest(
  request: Request,
  db: D1Database | undefined,
  authenticatedEmail: string | null | undefined,
): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!isAuthenticatedAccessIdentity(authenticatedEmail)) return json({ error: 'unauthorized' }, 401);
  if (!db) return json({ error: 'persistence_unavailable' }, 503);

  const rawBody = await request.text();
  if (rawBody.length > MAX_ANALYSIS_REQUEST_CHARACTERS + 200_000) return json({ error: 'request_too_large' }, 413);

  let raw: unknown;
  try {
    raw = JSON.parse(rawBody);
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const parsed = ImportDocumentSchema.safeParse(raw);
  if (!parsed.success) return json({ error: 'invalid_import' }, 400);
  if (sourceTextLength(parsed.data.document) > MAX_ANALYSIS_REQUEST_CHARACTERS) return json({ error: 'document_too_large' }, 413);

  try {
    const saved = await new D1CaseRepository(db).importAnalyzedDocument(parsed.data.document, parsed.data.explanation);
    return json({ saved: true, ...saved }, 201);
  } catch (error) {
    const name = error instanceof Error ? error.name : 'UnknownError';
    return json({ error: 'case_import_failed', errorType: name }, 502);
  }
}

export async function handleCaseExportRequest(
  request: Request,
  db: D1Database | undefined,
  authenticatedEmail: string | null | undefined,
): Promise<Response> {
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
  if (!isAuthenticatedAccessIdentity(authenticatedEmail)) return json({ error: 'unauthorized' }, 401);
  if (!db) return json({ error: 'persistence_unavailable' }, 503);

  try {
    return json(await new D1CaseRepository(db).exportCase());
  } catch (error) {
    const name = error instanceof Error ? error.name : 'UnknownError';
    return json({ error: 'case_export_failed', errorType: name }, 502);
  }
}

export async function handleCaseDeleteRequest(
  request: Request,
  db: D1Database | undefined,
  authenticatedEmail: string | null | undefined,
): Promise<Response> {
  if (request.method !== 'DELETE') return json({ error: 'method_not_allowed' }, 405);
  if (!isAuthenticatedAccessIdentity(authenticatedEmail)) return json({ error: 'unauthorized' }, 401);
  if (!db) return json({ error: 'persistence_unavailable' }, 503);

  try {
    await new D1CaseRepository(db).deleteCase();
    return json({ deleted: true });
  } catch (error) {
    const name = error instanceof Error ? error.name : 'UnknownError';
    return json({ error: 'case_delete_failed', errorType: name }, 502);
  }
}
