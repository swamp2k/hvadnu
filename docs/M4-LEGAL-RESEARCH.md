# M4 — Legal reference library and opt-in web research

## Goal

Give the message assistant access to current, source-backed Danish legal material without allowing model memory or uncited web prose to become legal authority.

M4 has two independent evidence paths:

1. a curated legal reference library in D1, always available to message retrieval;
2. optional web research, explicitly enabled by the user for a single analysis.

Neither path may promote case current-state entries. They provide legal/research evidence only.

## Curated legal reference library

`0004_legal_research.sql` creates `legal_references` plus an FTS5 index and initially populates the library with current official family-law sources verified 2026-08-20:

- Forældreansvarsloven, LBK nr. 662 af 01/07/2026, including core provisions on the child's best interests, parental responsibility, residence, contact, child involvement and changed circumstances;
- Familieretshuset guidance on contact agreements, parental responsibility and residence disputes;
- the current Forældreansvarsvejledning;
- Danmarks Domstole guidance on family-court handling of parental-responsibility cases.

Every entry records its authority, canonical URL, locator, version label, verification date and content kind.

The seeded text is deliberately `curated_summary`, not `verbatim_excerpt`. The model is instructed never to present a curated summary as exact statutory wording. Where exact wording matters and no primary/verbatim text is supplied, the answer must say that the linked primary source should be checked.

Legal retrieval is independent from private case retrieval and is bounded to six references / roughly 7,000 characters per message analysis.

## Source hierarchy

The message and review prompts enforce this hierarchy:

- current legislation and binding case-specific decisions/agreements are primary for their respective questions;
- official guidance may explain procedure and interpretation but cannot override legislation;
- published court decisions may show application, but their weight depends on court level, facts, date and the law then in force;
- secondary web commentary is supplementary only and cannot be the sole authority for a legal conclusion;
- model memory is never an authoritative source for current Danish law.

All material legal claims still require supplied source IDs.

## Optional web research

The Besked UI exposes `Søg også på nettet`. It is OFF by default and applies only to that analysis.

The web-search-enabled Anthropic request never receives the raw private message. A deterministic local mapper converts the message to a fixed set of generic legal topics such as `samvær`, `barnets bopæl`, `forældremyndighed`, `bodeling` or `frister`. Only those fixed topic labels are sent to the web-research model. Names, case numbers, phone numbers, exact quotes and arbitrary raw message text therefore cannot be copied from the private message into a search query by this path.

M4 uses Anthropic's basic `web_search_20250305` server tool because the Anthropic documentation reviewed for this milestone marks the basic web-search tool as compatible with Zero Data Retention. The newer/dynamic search path was deliberately not selected for this release.

Web research is research-only:

- it searches for current law, official guidance, legislative material and published decisions;
- the research model does not answer the private case;
- application code discards uncited research prose;
- only concrete web citations with URL, title and cited text become evidence sources;
- source domains are classified as official or secondary by exact/subdomain matching; lookalike domains do not count as official;
- all web evidence has `unknown` status and is subject to the normal source-ID validation and main analysis/reviewer rules.

If web search is unavailable or fails, the analysis continues using the private case material and curated legal library, and the UI shows a non-fatal warning.

## Evidence audit trail

Only web sources cited by the final analysis are persisted. `message_web_sources` stores the public URL, title, official/secondary classification and the exact cited snippet alongside the persisted message analysis.

This makes a historical answer auditable without promoting a web result into case current state. The web snapshots are included in case export and cascade-delete with the case.

The curated legal library is global application reference data and is not deleted when a case is deleted.

## Usage and cost

Web research is recorded separately as `web_research` in metadata-only AI usage telemetry. No private prompt, search query, source text or model output is stored in telemetry.

The web researcher is bounded to three searches and eight retained source URLs per requested analysis. Normal message analysis remains Sonnet 5 medium effort; existing critical-review routing remains unchanged.

## Maintenance

The legal library is versioned data, not evergreen truth. When a source changes:

1. verify the new official source/version;
2. add a forward migration that updates or deactivates the affected reference;
3. update `verified_at` and `version_label`;
4. keep summaries explicitly marked as summaries unless the stored content is actually a verified verbatim excerpt;
5. re-run migration invariants and legal retrieval tests.

Do not silently rewrite an already-applied migration.

## Production gate

Before merging M4 to `main`:

1. CI/typecheck/tests must pass on the final branch head;
2. actual diff and trust-boundary review must be completed;
3. `0004_legal_research.sql` must be applied to the EU production D1 database before the Worker code is promoted;
4. verify the library count, FTS search, `message_web_sources`, and the extended usage schema;
5. after deploy, test one normal analysis and one opt-in web analysis with non-sensitive synthetic text.
