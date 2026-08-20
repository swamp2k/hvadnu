# Security and privacy

## Classification

Treat all real case material as highly sensitive, including messages, children’s information, allegations, financial information, lawyer correspondence, and authority/court material.

## Hard rules

1. No real case data in this public repository, GitHub issues, pull requests, CI logs, fixtures, screenshots, stack traces, or demo deployments.
2. No secrets in Git. API credentials must be runtime secrets only.
3. Original uploaded files are immutable. Derived text and summaries are separate records.
4. No content analytics or third-party session replay.
5. Logs must not contain document text, message text, generated legal analysis, names, or other case payloads by default.
6. Real-data testing is prohibited until the Anthropic retention/data-processing position for the actual API organization is accepted.
7. Real-data deployment must use appropriately configured EU data storage for Cloudflare resources where supported.
8. Authentication must be enforced before any case endpoint or object is reachable.
9. Export and deletion must be designed before onboarding real data; the user must not become locked into the system.
10. A public or guessable object URL must never expose an R2 original.

## Threats explicitly in scope

- accidental publication through the public GitHub repository;
- secrets committed to source control;
- cross-user access due to missing authorization checks;
- sensitive payloads in provider/platform logs;
- stale or superseded documents producing unsafe advice;
- malicious or misleading text inside uploaded documents attempting prompt injection;
- an AI interpretation being mistaken for an authoritative source;
- lost source provenance after chunking/retrieval;
- browser/PWA caching of sensitive material longer than intended;
- accidental use of real data in automated tests.

## Real-data security gate

Before the first real SMS or document is uploaded, all of the following must be explicitly checked:

- Anthropic API organization retention/ZDR decision recorded;
- Cloudflare storage jurisdictions and configuration verified;
- authentication and authorization tested;
- payload logging reviewed and disabled/minimized as required;
- encryption-in-transit path verified;
- object access is private and authorized through the application;
- deletion/export path exists and has a test;
- synthetic eval suite passes;
- production secrets are not present in repository or client bundle.

Failure of any gate blocks real-data use.
