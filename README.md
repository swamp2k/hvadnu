# Hvad nu?

**Hvad nu?** er en lille mobil-first hjælper til svære dokumenter, beskeder og en rodet sagshistorik.

Målet er ikke at bygge en digital advokat. Målet er at gøre det hurtigt at forstå **hvad der står**, **hvad der er relevant**, og **hvad man kan svare**.

## Det kan appen

### Besked

Indsæt en modtaget besked og vælg den tone, svaret skal have. Sonnet:

- læser den aktuelle besked;
- bruger relevante tidligere beskeder og uploadede dokumenter, hvis de findes;
- kan søge på nettet i samme request, hvis aktuel lovgivning, offentlig vejledning, tidligere offentliggjorte sager eller anden aktuel information hjælper;
- foreslår et kort svar;
- forklarer sin fortolkning og viser de kilder, der blev brugt.

Visningen er bevidst enkel:

**Modtaget besked → Forslag til svar → AI fortolkning og analyse**

### Dokument

Upload PDF, DOCX eller tekst. Dokumentet bliver forklaret i almindeligt dansk med fokus på bl.a.:

- hvad dokumentet faktisk siger;
- forslag, påstande, aftaler og afgørelser;
- beløb, handlinger og frister;
- hvad der er vigtigt at være opmærksom på.

Et dokument kan gemmes i sagen og bruges som kontekst til senere beskeder og spørgsmål.

### Sagen

Sagen viser den eksisterende tidslinje og aktuelle sagsoversigt.

Derudover kan brugeren stille spørgsmål til de gemte beskeder og dokumenter. Hvis der ikke findes relevant materiale i sagen, siger appen det tydeligt og giver i stedet et generelt svar baseret på web search.

## Arkitektur

- React + Vite
- Cloudflare Worker
- Cloudflare Access
- Cloudflare D1 til gemte beskeder, dokumenttekst, analyser og sagsoversigt
- Anthropic API med `claude-sonnet-5`
- Anthropic server-side web search efter behov
- Zod til strukturerede API-kontrakter
- Vitest + TypeScript + production build i CI

AI-flowet holdes bevidst simpelt: **ét Sonnet-kald pr. brugerhandling**. Der er ingen reviewer-model, critic-pass eller separat legal-research-agent.

Det tidligere juridiske referencebibliotek er kun bevaret som historisk migration i Git; migration 0005 fjerner tabellerne fra den aktuelle D1-sluttilstand. Juridisk eller anden aktuel ekstern information findes via Sonnets web search, når det er relevant.

## Datagrænser

- Reelle sagsdata må aldrig lægges i dette offentlige repository eller i testfixtures.
- Browseren får aldrig provider-secrets.
- API-ruter med private sagsdata ligger bag Cloudflare Access.
- Gemte beskeder og dokumenter er source material; AI-analyse er derived data.
- AI må ikke automatisk gøre en fortolkning til bekræftet current state.

## Development

```bash
npm install
npm run dev
```

Validation:

```bash
npm run check
```

`npm run check` kører TypeScript typecheck, Vitest og production Vite build.
