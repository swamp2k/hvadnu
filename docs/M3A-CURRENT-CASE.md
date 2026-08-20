# Milestone 3a — current-case foundation

## Goal

Introduce the timeline/current-state domain and a D1-ready schema without persisting real case material yet.

## Trust boundary

- Original sources remain the evidence layer.
- Timeline entries are derived/indexed views with source IDs.
- Current-state entries distinguish candidate, confirmed, superseded and rejected state.
- AI may propose a candidate but cannot confirm it.
- `confirmedBy` only accepts `user` or `deterministic_rule`.
- A confirmed entry without explicit non-AI confirmation is invalid in both Zod and the D1 schema.

## M3a runtime

The UI uses only the synthetic case snapshot. No D1 binding is added to `wrangler.jsonc`, no migrations are applied to production, and document/message uploads are not persisted.

The repository contract is exercised using an in-memory implementation so confirmation behavior and defensive-copy semantics can be tested without real data.

## D1 schema

`migrations/0001_case_state.sql` defines:

- cases
- immutable source metadata
- timeline events and source links
- current-state entries and source links
- supersession relations

The migration is deliberately committed before a live D1 database exists so schema review can happen before any production data path is enabled.

## M3b gate

Before production persistence:

1. create an EU-jurisdiction D1 database;
2. add the explicit D1 binding to Wrangler;
3. apply migrations to an isolated/empty database first;
4. implement and test the D1 repository;
5. add authenticated case endpoints;
6. add an explicit save/import action — analysis must not silently persist uploads;
7. add deletion/export behavior;
8. run only synthetic end-to-end persistence tests;
9. review the actual production diff before enabling real case storage.
