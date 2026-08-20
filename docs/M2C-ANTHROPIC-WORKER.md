# Milestone 2c — Anthropic Worker boundary

## Decision recorded 2026-08-20

The target Anthropic API organization has Zero Data Retention enabled. The project owner explicitly accepted the remaining provider-processing risk for this private family-law use case.

This clears the retention decision from M2b. It does **not** bypass authentication, private-deployment, secret-management, or no-payload-logging requirements.

## Verified provider path

M2c uses the official `@anthropic-ai/sdk` TypeScript SDK. The SDK supports Cloudflare Workers.

Document analysis uses `claude-sonnet-5` and Anthropic structured outputs through `messages.parse()` + `zodOutputFormat(DocumentExplanationPayloadSchema)`. The response is therefore schema-constrained at the provider and is still validated by the application boundary before use.

The generic output schema must never contain case-specific personal data in field names, enum values, descriptions, or other schema metadata. All case material belongs only in message content.

## Endpoint

`POST /api/analyze-document`

The endpoint accepts the existing `ExtractedDocument` JSON contract and returns `{ analysis: DocumentExplanation }`.

It is same-origin only by design. No CORS headers are emitted.

## Required runtime bindings

Secret:

- `ANTHROPIC_API_KEY` — server-side secret only.

Non-secret configuration:

- `ALLOWED_EMAIL` — the single Cloudflare Access-authenticated user allowed to call the endpoint.
- `DOCUMENT_ANALYSIS_ENABLED=true`
- `PRIVATE_DEPLOYMENT_APPROVED=true`
- `ANTHROPIC_ZDR_APPROVED=true`
- `PAYLOAD_LOGGING_DISABLED=true`

The endpoint remains unavailable if any one of these gates is absent or false.

## Authentication

The endpoint trusts the `Cf-Access-Authenticated-User-Email` header only after the deployment is actually protected by Cloudflare Access. It compares that identity against `ALLOWED_EMAIL` before parsing the body or constructing the Anthropic provider.

Do not expose the Worker directly around Access while marking `PRIVATE_DEPLOYMENT_APPROVED=true`.

## Data/logging rules

- No document text, message text, prompts, responses, or generated analysis may be written to application logs.
- API errors returned to the client are metadata-only.
- Responses use `Cache-Control: no-store`.
- The request body has an endpoint-level size guard before JSON parsing, and the analysis service independently derives its model-size guard from actual extracted source text.
- No real case data belongs in GitHub, CI, public previews, issues, or test fixtures.

## Not deployed by this milestone

No Cloudflare Worker, Access policy, route, domain, environment variables, or secret is created by M2c because the Cloudflare connector is not available in the current session. The code is prepared and validated in GitHub only.

Deployment is the next explicit operation: create a private Worker/route, put Cloudflare Access in front of it, configure the non-secret gates, add `ANTHROPIC_API_KEY` as a secret, verify logs contain no payloads, then perform a synthetic end-to-end call before any real case material is used.
