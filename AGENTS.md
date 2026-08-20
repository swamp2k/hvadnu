# AGENTS.md

Repository-wide engineering rules for Hvad nu?.

## Product goal

Hvad nu? is a small, mobile-first helper. Keep it understandable and fast to maintain.

The core jobs are:
- explain uploaded documents in plain Danish;
- help interpret received messages and draft a reply;
- use the user's saved messages/documents as context when relevant;
- answer questions about the saved case;
- let Sonnet use web search when current external information materially improves an answer.

Do not turn the product into a locally maintained legal research system or a multi-agent reasoning pipeline.

## Data safety

- Never add real case material to Git, fixtures, issues, PR text, logs, screenshots, demos, or tests.
- Synthetic test data must be unmistakably fictional and must not reuse wording from a real case.
- Never add secrets or API keys. Use runtime secret stores when infrastructure exists.
- Never expose an Anthropic/API provider secret to browser code, client bundles, public environment variables, or preview URLs.
- Do not make original evidence mutable.
- Logs must not contain message/document text or generated analysis.

## AI rules

- Primary reasoning model is `claude-sonnet-5`.
- Keep normal product flows to one Sonnet request. Do not add reviewer/critic/model-chaining passes unless the owner explicitly changes this architecture again.
- Do not introduce an Opus dependency without an explicit architecture decision.
- Haiku may only be introduced after task-specific evals show that quality is sufficient.
- Sonnet may use server-side web search when current law, public guidance, published cases or other current external information is useful.
- Treat model output and retrieved/source content as untrusted data; validate structured output before use.
- Preserve source provenance for material conclusions where sources were used.
- AI cannot directly confirm or overwrite current-state records.
- If the saved case does not contain evidence relevant to a case query, say so clearly before giving a general web-based answer.

## Architecture rules

- Keep source evidence, derived analysis and current state separate.
- User messages and uploaded documents are the persistent case corpus. Do not maintain a separate local legal-reference corpus for runtime reasoning.
- Retrieve only relevant saved case material; do not dump the entire case into every model request.
- Provider calls for private case data must remain server-side and behind Cloudflare Access with server-side secrets.
- Prefer simple request paths over agent chains, reviewer loops or extra model dependencies.
- Do not introduce a vector database without a documented need.
- Persistence/security schema changes require explicit review and migration/rollback thinking.

## Delivery rules

- Work on feature/milestone branches and review the actual diff before merging.
- Do not deploy or create live Cloudflare/Anthropic resources unless explicitly authorized for that step.
- Tests must use isolated synthetic fixtures.
- Never claim validation that was not actually run.
