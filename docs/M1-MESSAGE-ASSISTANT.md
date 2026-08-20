# Milestone 1 — Message assistant

## Goal

Deliver the first mobile-first vertical slice without pretending that production AI or real case retrieval exists yet.

The user can paste a message, run an analysis, and receive the exact product structure planned for production:
- neutral summary;
- what requires a reply;
- what can be ignored;
- relevant case context with source IDs;
- legal assessment separated from communication strategy;
- suggested short reply;
- explicit uncertainty and missing information;
- review/escalation status;
- visible source details.

## Demo boundary

M1 is intentionally a synthetic deterministic demo. It does not call Anthropic, Cloudflare, or any external service. It does not persist input. Real case data remains prohibited.

The deterministic demo engine recognises only the synthetic scenarios needed to validate UX and safety behavior. Unknown messages must abstain rather than simulate a legal answer.

## Acceptance criteria

1. Mobile-first UI works without a desktop-width assumption.
2. No input is transmitted or persisted.
3. The current agreement, lawyer proposal, and party claim remain visibly different source states.
4. The app pushes back when the app user asserts an unsupported legal right.
5. Unknown text produces an uncertainty response, not fabricated case context.
6. High-risk/uncertain synthetic cases expose the two-pass Sonnet production rule and human-review recommendation where policy requires it.
7. Suggested replies are short, neutral, and do not diagnose or attack the other parent.
8. Source text can be expanded from the analysis.
9. Typecheck, tests, and production Vite build pass in CI.

## Not in M1

- Anthropic API calls
- production legal-source retrieval
- D1/R2 persistence
- authentication
- document upload
- Android share target
- real user data

Those remain gated behind later milestones and the real-data security decision.
