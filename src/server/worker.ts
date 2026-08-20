import { handleDocumentAnalysisRequest, type WorkerEnv } from './document-analysis-endpoint';

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/health' && request.method === 'GET') {
      return new Response(JSON.stringify({ ok: true }), {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        },
      });
    }

    if (url.pathname === '/api/analyze-document') {
      return handleDocumentAnalysisRequest(request, env);
    }

    return new Response('Not found', { status: 404 });
  },
};
