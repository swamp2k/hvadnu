# Hvad nu? Architecture

## Purpose

Hvad nu? is a mobile-first decision-support system for one private family-law case. It helps the user understand incoming messages, understand documents, identify the currently applicable case state, and query the complete evidence corpus.

It is not an autonomous lawyer and must not silently convert model output into authoritative case facts.

## Planned runtime architecture

```text
Mobile PWA
   |
Cloudflare Worker / Hono API
   |-- D1 (EU jurisdiction): metadata, extracted text, assertions, timeline, current-state records
   |-- R2 (EU jurisdiction): immutable originals and exports
   |
Retrieval layer
   |-- exact metadata/date/person/topic filters
   |-- D1 full-text retrieval
   |-- bounded reranking
   |
Anthropic provider
   |-- claude-sonnet-5 first pass
   `-- claude-sonnet-5 independent review pass when risk policy requires it
```

React + Vite are planned for the mobile UI. Runtime dependencies are deliberately not added during Milestone 0 until the domain and safety contracts are accepted.

## Core boundaries

### Source layer
Original messages and documents. Original bytes are immutable. A cryptographic content hash is stored when ingestion exists. Source text is untrusted data and can never become model instruction merely because it appears in a retrieved document/message.

### Evidence layer
Structured observations derived from sources. Every assertion must point back to one or more source references. Assertions explicitly distinguish fact, claim, agreement, decision, proposal, and interpretation.

### Current-state layer
A concise view of what is believed to apply now. AI may propose candidates but cannot directly confirm them. Confirmation must come from an explicit user action or a deterministic rule whose prerequisites are auditable.

### Retrieval layer
Selects a small evidence bundle relevant to a question. The default v1 strategy is metadata + D1 full-text search, not a vector database. Retrieval must preserve source IDs and status.

### Reasoning layer
Claude Sonnet 5 reasons only over the supplied evidence bundle and supplied current legal sources. Model memory is not an authoritative legal source.

## Model routing

There is no Opus dependency.

Normal questions receive one Sonnet 5 pass. High-risk, highly uncertain, conflicting, evidence-insufficient, or deadline-sensitive questions receive a second independent Sonnet 5 review pass. A human legal review recommendation is driven by explicit policy rather than by model confidence alone.

## Deployment boundary

Milestone 0 creates no Cloudflare resources, no Anthropic API credentials, and no live deployment. Real case data is prohibited until the security/privacy gate in `SECURITY.md` is satisfied.
