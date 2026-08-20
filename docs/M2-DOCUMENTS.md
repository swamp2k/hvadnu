# Milestone 2a — local document ingestion

## Goal

Add a real document path without crossing the real-data security gate.

M2a reads supported documents inside the browser, extracts machine-readable text, and shows extraction warnings/provenance. It also includes one synthetic document explanation to validate the eventual mobile UX for legal-document summaries.

## Supported local formats

- PDF via `pdfjs-dist`
- DOCX via Mammoth raw-text extraction
- TXT/MD/other `text/*`

No extracted content is intentionally transmitted or persisted by Hvad nu? in M2a.

## Safety constraints

- Maximum local file size: 25 MB.
- DOCX has a stricter 10 MB limit because the compressed container may expand significantly in memory while parsing.
- Maximum PDF length for local mobile parsing: 300 pages.
- Scanned/image-only PDFs are detected heuristically when extraction yields very little text and are flagged as requiring OCR/vision.
- DOCX is converted to raw text only. Untrusted document HTML is never rendered.
- DOCX raw-text extraction does not preserve reliable physical page numbers, so the UI labels it as a text block rather than inventing page provenance.
- PDF extraction preserves page boundaries.
- Extracted source text remains untrusted data and must never become model instruction.
- Public preview hosts must still be treated as preview environments: do not use real case material there.

## Synthetic explanation contract

The included fake lawyer letter demonstrates the target output:

- document type;
- source status (proposal/current/decision/etc.);
- short plain-language summary;
- what the document actually establishes;
- actions;
- dates/deadlines with source labels;
- important passages;
- explicit uncertainty.

The synthetic letter is deliberately classified as `proposal`, not `agreement`, and its requested response date is not presented as a statutory deadline.

## Deliberately not in M2a

- Anthropic API calls for uploaded documents
- OCR/vision for scanned PDFs
- R2/D1 persistence
- document hashing/version history
- authentication/private deployment
- automatic current-state updates

Those require the private production data path and retention/security decisions before real case data is allowed.
