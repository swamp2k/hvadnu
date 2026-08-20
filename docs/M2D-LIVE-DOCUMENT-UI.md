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

The repository now records these approved non-secret gates as `true` in `wrangler.jsonc`:

- `DOCUMENT_ANALYSIS_ENABLED`
- `PRIVATE_DEPLOYMENT_APPROVED`
- `ANTHROPIC_ZDR_APPROVED`
- `PAYLOAD_LOGGING_DISABLED`

This does **not** make the endpoint available by itself. The Worker still requires both:

- `ANTHROPIC_API_KEY`
- `ALLOWED_EMAIL`

Neither belongs in Git. Configure them directly in Cloudflare runtime settings. `ALLOWED_EMAIL` may be stored as a secret as well even though it is not a credential; this keeps the case user's identity out of the public repository.

`keep_vars=true` remains enabled so dashboard/runtime-only bindings are preserved across GitHub-driven deploys.

## Status endpoint

`GET /api/analysis-status`

- requires the exact Cloudflare Access email allowlist match;
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

After this milestone deploys:

1. configure `ANTHROPIC_API_KEY` directly in Cloudflare;
2. configure `ALLOWED_EMAIL` directly in Cloudflare;
3. open the protected app as that Access user;
4. confirm the document action becomes enabled;
5. run one synthetic document end-to-end;
6. inspect Cloudflare logs/observability for metadata only — no case text, prompts, or model response payloads;
7. only then use real case material.
