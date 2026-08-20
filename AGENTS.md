# AGENTS.md

Repository-wide engineering rules for Hvad nu?.

## Data safety

- Never add real case material to Git, fixtures, issues, PR text, logs, screenshots, demos, or tests.
- Synthetic test data must be unmistakably fictional and must not reuse wording from a real case.
- Never add secrets or API keys. Use runtime secret stores when infrastructure exists.
- Do not make original evidence mutable.

## AI rules

- Primary reasoning model is `claude-sonnet-5`.
- Do not introduce an Opus dependency without an explicit architecture decision.
- Haiku may only be introduced after task-specific evals show that quality is sufficient.
- Model memory is not an authoritative source for current law.
- Every material conclusion must retain source provenance.
- AI cannot directly confirm or overwrite current-state records.
- High-risk/uncertain/conflicting cases use a separate Sonnet review pass according to policy.

## Architecture rules

- Keep source evidence, derived assertions, current state, retrieval, and reasoning as separate layers.
- Prefer deterministic extraction/rules where they are safer than model inference.
- Do not introduce a vector database in v1 without a documented need and data-processing review.
- Persistence/security schema changes require explicit review and migration/rollback thinking.

## Delivery rules

- Work on feature/milestone branches and review the actual diff before merging.
- Do not deploy or create live Cloudflare/Anthropic resources unless explicitly authorized for that step.
- Tests must use isolated synthetic fixtures.
- Never claim validation that was not actually run.
