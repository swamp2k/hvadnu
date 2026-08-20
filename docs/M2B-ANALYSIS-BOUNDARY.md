# Milestone 2b — model analysis boundary

## Goal

Prepare the production Sonnet document-analysis path without enabling any network call or accepting real case data yet.

M2b deliberately stops before provider implementation. It defines the contract that a future server-side Anthropic adapter must satisfy and makes the safe default a hard-closed gate.

## Model boundary

- Model is fixed to `claude-sonnet-5` by the service contract.
- The browser must never receive an Anthropic API key.
- Provider calls belong in a private/authenticated server runtime only.
- Model output is treated as untrusted data and must pass `DocumentExplanationPayloadSchema` before it can become a `model_analysis` result.
- The server, not the model, assigns `mode=model_analysis`.
- Source document text is passed as explicitly untrusted data with locators; embedded source instructions are not application instructions.

## Runtime gate

A provider call is impossible unless all of these are true:

1. document analysis explicitly enabled;
2. authentication enforced;
3. deployment approved for private case data;
4. Anthropic retention/data processing explicitly approved;
5. server-side API secret configured;
6. payload logging confirmed disabled.

The default gate has all six conditions false.

## Cost/performance guard

A single document-analysis request is capped at 120,000 extracted characters. Larger material must use a future chunking/retrieval pipeline rather than silently sending a huge prompt. This is both a mobile/runtime guard and a token-cost/quality guard.

## What M2b does not do

- no Anthropic SDK or HTTP call;
- no API key;
- no Cloudflare Worker endpoint;
- no authentication implementation;
- no R2/D1 storage;
- no real case data;
- no decision that current Anthropic retention is acceptable.

Those are the next explicit security/deployment gate, not implementation details to sneak into a code milestone.
