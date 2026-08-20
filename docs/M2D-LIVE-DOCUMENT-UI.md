# Milestone 2d — live document-analysis UI

## Goal

Connect the already-deployed private app to the M2c analysis endpoint without weakening the fail-closed runtime boundary.

## User flow

1. PDF/DOCX/TXT is parsed locally in the browser.
2. The app checks `GET /api/analysis-status` over the same origin.
3. The **Forklar dokumentet** action is enabled only when the authenticated server reports `available: true`.
4. The original file is not uploaded. The existing `ExtractedDocument` JSON (including extracted text and PDF page locators) is posted to `POST /api/analyze-document`.
5. The Worker calls Sonnet 5 through the server-only Anthropic adapter.
6. The response must pass the production `DocumentExplanationSchema` with `mode=model_analysis` before it is shown.

## Production gates

The repository records these approved non-secret gates as `true` in `wrangler.jsonc`:

- `DOCUMENT_ANALYSIS_ENABLED`
- `PRIVATE_DEPLOYMENT_APPROVED`
- `ANTHROPIC_ZDR_APPROVED`
- `PAYLOAD_LOGGING_DISABLED`

The only application runtime secret required by this milestone is:

- `ANTHROPIC_API_KEY`

It is declared in `wrangler.jsonc` as `secrets.required`. A production deploy therefore fails closed if the Anthropic key is missing. The value never belongs in Git.

## Authentication and authorization boundary

Cloudflare Access is the single source of truth for who may use Hvad nu?. Do not maintain a second user/email allowlist inside the Worker.

The Worker does not trust identity headers supplied on the request. It resolves the authenticated identity from Cloudflare's Worker-native Access context with `ctx.access.getIdentity()`.

Any identity already authorized by the Cloudflare Access policy is accepted by the application. If `ctx.access` is absent, identity lookup fails, or no identity email can be resolved, document analysis remains unavailable and no source text is read or sent to Anthropic.

Changing who may use the application is therefore a Cloudflare Access policy operation only; no Worker secret or redeploy is needed for user changes.

## Status endpoint

`GET /api/analysis-status`

- requires a verified Cloudflare Access identity;
- never constructs an Anthropic client;
- never reads a document body;
- returns only `{ "available": true|false }`;
- does not reveal missing gate names, secret presence, or configuration details.

If the status request fails for any reason, the browser treats analysis as unavailable and sends no document text.

## Data boundary

Before analysis, extracted text exists only in the browser.

After the user explicitly taps **Forklar dokumentet**, the extracted text (not the original file bytes) crosses the private Worker/Anthropic boundary. The UI states this distinction explicitly.

The existing limits, ZDR decision, source-status protections, no-payload-logging rule, no-store responses, and source-provenance requirements remain unchanged.

## First production activation

1. configure `ANTHROPIC_API_KEY` directly in Cloudflare as a secret;
2. merge/deploy M2d; Wrangler rejects the deployment if the required Anthropic secret is absent;
3. open the protected app as any user permitted by the Cloudflare Access policy;
4. confirm the document action becomes enabled;
5. run one synthetic document end-to-end;
6. inspect Cloudflare logs/observability for metadata only — no case text, prompts, or model response payloads;
7. only then use real case material.
