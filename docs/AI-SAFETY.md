# AI safety contract

## Model policy

Production reasoning target: `claude-sonnet-5`.

There is deliberately no Opus dependency. Cost control is achieved with bounded retrieval and one-pass/two-pass Sonnet routing rather than a more expensive fallback model.

Haiku is not used in Milestone 0. It may be introduced later only for tasks that pass dedicated quality tests.

## Legal grounding

Model memory is not an authoritative legal source. Legal conclusions must cite supplied, current legal material plus the user's relevant case sources.

When current legal material is missing, the system must say so rather than fill the gap from memory.

## Neutrality

The assistant is not the user's advocate in its factual analysis. It must be willing to conclude that:
- the other parent is correct on a point;
- the user's proposed response is unsupported;
- neither side's assertion is established;
- the available evidence is insufficient.

No psychological diagnosis or motive attribution is allowed from communication style alone.

## Two-pass Sonnet review

Second-pass review is mandatory when policy detects high/critical risk, high legal uncertainty, insufficient evidence, or conflicting sources.

The review pass receives the evidence bundle and first analysis and is instructed to find unsupported certainty, source-status errors, contradictions, escalation risk, and missing reasons for human legal review.

A second Sonnet pass is a quality control mechanism, not an independent legal authority.

## Required abstention behavior

When evidence is insufficient, the user-facing answer should identify:
1. what cannot be concluded;
2. what information/source is missing;
3. what can safely be said from existing sources;
4. whether qualified human review is recommended before action.
