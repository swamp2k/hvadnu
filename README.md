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
- Retrieved source content is untrusted data, never model instruction.
- No real case data is permitted in this public repository.

## Model strategy

`claude-sonnet-5` is the only planned reasoning model in the initial architecture. Normal questions use one pass; policy-selected high-risk, uncertain, conflicting, deadline-sensitive, or evidence-insufficient questions receive a separate Sonnet review pass. There is no Opus dependency.

## Planned stack

- TypeScript
- React + Vite
- Cloudflare Worker + Hono
- D1 with EU jurisdiction for structured case data
- R2 with EU jurisdiction for private originals
- Anthropic API
- Zod for structured contracts
- Vitest + Playwright

## Current status

**Milestone 1 — Message assistant (synthetic demo)**

M1 adds the first real mobile UI and the production-shaped analysis result contract. It deliberately uses a deterministic synthetic engine: no text is sent to Claude, no input is stored, and real case data remains prohibited.

Try the two built-in synthetic scenarios to validate the UX and safety behavior. Unknown messages return uncertainty instead of a fabricated answer.

See:

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md)
- [`docs/SECURITY.md`](docs/SECURITY.md)
- [`docs/AI-SAFETY.md`](docs/AI-SAFETY.md)
- [`docs/EVALS.md`](docs/EVALS.md)
- [`docs/M1-MESSAGE-ASSISTANT.md`](docs/M1-MESSAGE-ASSISTANT.md)
- [`docs/MILESTONES.md`](docs/MILESTONES.md)

## Development

```bash
npm install
npm run dev
```

Validation:

```bash
npm run check
```

`npm run check` runs TypeScript typechecking, Vitest, and a production Vite build.

Only synthetic data may be used for local/CI development until the real-data security gate is explicitly cleared.
