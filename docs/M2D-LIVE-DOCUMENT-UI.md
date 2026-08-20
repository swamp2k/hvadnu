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

The Worker also requires both runtime secrets:

- `ANTHROPIC_API_KEY`
- `ALLOWED_EMAIL`

They are declared in `wrangler.jsonc` as `secrets.required`. Current Wrangler validates required secrets during a real deploy, so production deployment fails closed if either is missing. Neither value belongs in Git.

Store `ALLOWED_EMAIL` as a Cloudflare secret too even though it is not a credential; this keeps the case user's identity out of the public repository. Secrets are preserved across normal Wrangler deploys. `keep_vars=true` also remains enabled so other dashboard/runtime-only variables are not erased by GitHub-driven deploys.

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

Before the first successful M2d production deploy:

1. configure `ANTHROPIC_API_KEY` directly in Cloudflare as a secret;
2. configure `ALLOWED_EMAIL` directly in Cloudflare as a secret;
3. merge/deploy M2d; Wrangler will reject the deployment if either required secret is absent;
4. open the protected app as that Access user;
5. confirm the document action becomes enabled;
6. run one synthetic document end-to-end;
7. inspect Cloudflare logs/observability for metadata only — no case text, prompts, or model response payloads;
8. only then use real case material.
