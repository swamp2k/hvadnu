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

The Worker supports both Cloudflare Access integration modes:

1. **Worker-native Access** — if `ctx.access` is present, the Worker resolves the user with `ctx.access.getIdentity()` and never uses a fallback.
2. **Classic/self-hosted Access** — if `ctx.access` is absent, the Worker reads `Cf-Access-Jwt-Assertion` and cryptographically verifies the application token using Cloudflare's account signing keys. Verification requires the configured team-domain issuer and this Access application's AUD tag.

Classic verification follows Cloudflare's Worker guidance and uses `jose` with:

- JWKS: `https://hadus.cloudflareaccess.com/cdn-cgi/access/certs`
- issuer: `https://hadus.cloudflareaccess.com`
- application audience: the configured `POLICY_AUD`
- algorithm: `RS256`

`TEAM_DOMAIN` and `POLICY_AUD` are application identifiers, not user authorization rules or secrets. Changing who may use the application remains a Cloudflare Access policy operation only.

The application never trusts a copied email header. If Worker-native identity lookup fails, the Access token is absent, the signature/issuer/audience check fails, or no email claim is present, analysis remains unavailable and the document body is not read or sent to Anthropic.

## Status endpoint

`GET /api/analysis-status`

- requires a verified Cloudflare Access identity through one of the two modes above;
- never constructs an Anthropic client;
- never reads a document body;
- returns only `{ "available": true|false }`;
- does not reveal missing gate names, secret presence, or configuration details.

If the status request fails for any reason, the browser treats analysis as unavailable and sends no document text.

## Data boundary

Before analysis, extracted text exists only in the browser.

After the user explicitly taps **Forklar dokumentet**, the extracted text (not the original file bytes) crosses the private Worker/Anthropic boundary. The UI states this distinction explicitly.

The existing limits, ZDR decision, source-status protections, no-payload-logging rule, no-store responses, and source-provenance requirements remain unchanged.

## Deployment/version recovery

PDF.js and other large parsers are lazy-loaded as hashed Vite chunks. A browser tab that remains open across a deployment can therefore reference an asset hash that no longer exists. Vite emits `vite:preloadError` for this case.

The client performs one guarded reload on that event so the browser receives the current asset manifest. A sessionStorage timestamp prevents reload loops if the failure is caused by something other than version skew.

## First production activation

1. configure `ANTHROPIC_API_KEY` directly in Cloudflare as a secret;
2. configure `TEAM_DOMAIN` and `POLICY_AUD` in Wrangler from the existing Access application metadata;
3. merge/deploy; Wrangler rejects the deployment if the required Anthropic secret is absent;
4. open the protected app as any user permitted by the Cloudflare Access policy;
5. confirm the document action becomes enabled;
6. run one synthetic document end-to-end;
7. inspect Cloudflare logs/observability for metadata only — no case text, prompts, or model response payloads;
8. only then use real case material.
