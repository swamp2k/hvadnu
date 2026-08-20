# Data model

## Design principle

The system stores evidence and interpretations separately. A polished AI summary must never overwrite or become indistinguishable from the underlying source.

## SourceRecord

Represents an imported source: message, agreement, decision, lawyer letter, authority guidance, or other document.

Important fields:
- immutable source ID;
- source type;
- occurrence/document date;
- content hash when ingestion is implemented;
- status: `current`, `superseded`, `disputed`, or `unknown`;
- explicit source IDs that it supersedes.

## EvidenceAssertion

A statement derived from one or more sources. Its kind is explicit:
- `fact`: directly established by adequate supplied evidence;
- `claim`: a party says something is true;
- `agreement`: evidence of an agreement;
- `decision`: an authority/court decision;
- `proposal`: something offered but not established as accepted;
- `interpretation`: analysis, summary, or inference.

Every assertion requires source references.

## CurrentStateEntry

Represents a concise answer to “what applies now?” for a topic such as contact schedule, residence, parental authority, property valuation, or an open dispute.

States:
- `candidate`: proposed but not confirmed;
- `confirmed`: usable as current state;
- `rejected`;
- `superseded`.

AI may propose a candidate. A confirmed entry requires `confirmedBy=user` or `confirmedBy=deterministic_rule`. `confirmedBy=ai` is intentionally impossible in the schema.

## Provenance rule

Anything shown to the user as a material factual or legal basis must retain enough provenance to navigate back to its source. Page/message locators are preferred where available.
