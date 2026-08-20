import {
  handleDocumentAnalysisRequest,
  handleDocumentAnalysisStatusRequest,
  type WorkerEnv,
} from './document-analysis-endpoint';

interface AccessIdentity {
  email?: string;
}

interface WorkerAccessContext {
  access?: {
    getIdentity(): Promise<AccessIdentity | null>;
  };
}

async function getAccessEmail(ctx: WorkerAccessContext): Promise<string | null> {
  if (!ctx.access) return null;
  const identity = await ctx.access.getIdentity();
  return identity?.email ?? null;
}

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: WorkerAccessContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/health' && request.method === 'GET') {
      return new Response(JSON.stringify({ ok: true }), {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        },
      });
    }

    if (url.pathname === '/api/analysis-status') {
      return handleDocumentAnalysisStatusRequest(request, env, await getAccessEmail(ctx));
    }

    if (url.pathname === '/api/analyze-document') {
      return handleDocumentAnalysisRequest(request, env, await getAccessEmail(ctx));
    }

    return new Response('Not found', { status: 404 });
  },
};
