# Milestones

## M0 — Foundation

- Architecture and trust boundaries
- Evidence/current-state domain model
- Sonnet-only review policy
- Security/privacy gate
- Synthetic case and eval requirements
- No live infrastructure or real data

## M1 — Message assistant

Mobile-first paste/analyse flow using synthetic data. Output separates: summary, reply-worthy points, noise/accusations, known case state, uncertainty, legal vs communication assessment, reply suggestion, and human-review flag.

## M2 — Documents

Private upload, immutable originals, deterministic extraction where possible, structured document explanation, source citations, version/status handling, and safe failure for unreadable documents.

## M3 — Current case

Human-readable “what applies now?” view and timeline. AI may propose state changes but cannot confirm them directly.

## M4 — Ask everything

Cross-source query over messages, documents, timeline, and current state with bounded retrieval and source-level citations.

## M5 — Real-data pilot

Only after the real-data security gate and synthetic evaluation suite pass.

## M6 — Convenience

PWA installation polish, Android share target where safe, screenshot ingestion, optional semantic retrieval only if its data-processing/storage model is acceptable.
