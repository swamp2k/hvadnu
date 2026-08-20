# Hvad nu?

**Hvad nu?** is a mobile-first decision-support tool for navigating a long-running family-law case while keeping every important conclusion traceable to its source.

The product is designed for a non-lawyer using only a phone. Its job is to reduce the cognitive load of messages, legal documents, conflicting claims, and years of case history without pretending that an LLM is an autonomous lawyer.

## Product areas

1. **Message assistant** — analyse an incoming message, identify what actually needs a response, check it against the current case state, separate legal assessment from communication strategy, and suggest a short neutral reply.
2. **Documents** — store originals, explain difficult material in plain language, identify dates/obligations/proposals/decisions, and preserve page-level provenance.
3. **Current case** — answer “what applies now?” without confusing an old agreement, a lawyer proposal, and a binding/current arrangement.
4. **Ask everything** — query the whole case across documents, messages, timeline, and current state with source citations.

## Hard safety properties

- Original evidence is immutable.
- Claims, facts, proposals, agreements, decisions, and interpretations are different data types.
- AI-generated interpretation is never silently promoted to confirmed case state.
- Model memory is not an authoritative source for current Danish law.
- Material answers require source provenance.
- Insufficient evidence must produce uncertainty/abstention rather than invented certainty.
- The system is allowed to tell the user that the user's own position is unsupported.
- No real case data is permitted in this public repository.

## Model strategy

`claude-sonnet-5` is the only planned reasoning model in the initial architecture. Normal questions use one pass; policy-selected high-risk, uncertain, conflicting, or evidence-insufficient questions receive a separate Sonnet review pass. There is no Opus dependency.

## Planned stack

- TypeScript
- React + Vite PWA
- Cloudflare Worker + Hono
- D1 with EU jurisdiction for structured case data
- R2 with EU jurisdiction for private originals
- Anthropic API
- Zod for structured contracts
- Vitest + Playwright

Milestone 0 intentionally installs only the dependencies needed to validate the domain/safety contracts. Runtime/UI infrastructure arrives with the milestone that uses it.

## Current status

**Milestone 0 — Foundation**

No Cloudflare resources, Anthropic credentials, production deployment, or real case data exist yet.

See:

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md)
- [`docs/SECURITY.md`](docs/SECURITY.md)
- [`docs/AI-SAFETY.md`](docs/AI-SAFETY.md)
- [`docs/EVALS.md`](docs/EVALS.md)
- [`docs/MILESTONES.md`](docs/MILESTONES.md)

## Development

```bash
npm install
npm run check
```

Only synthetic data may be used for local/CI development until the real-data security gate is explicitly cleared.
