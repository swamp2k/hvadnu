PRAGMA foreign_keys = ON;

CREATE TABLE legal_references (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  authority TEXT NOT NULL,
  source_url TEXT NOT NULL,
  locator TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('law', 'official_guidance', 'court_guidance')),
  content_kind TEXT NOT NULL CHECK (content_kind IN ('curated_summary', 'verbatim_excerpt')),
  version_label TEXT NOT NULL,
  published_at TEXT,
  verified_at TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100 CHECK (priority >= 0),
  keywords TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

CREATE VIRTUAL TABLE legal_reference_fts USING fts5(
  reference_id UNINDEXED,
  title,
  keywords,
  text,
  tokenize = 'unicode61'
);

CREATE TRIGGER trg_legal_references_fts_insert
AFTER INSERT ON legal_references
WHEN NEW.active = 1
BEGIN
  INSERT INTO legal_reference_fts (reference_id, title, keywords, text)
  VALUES (NEW.id, NEW.title, NEW.keywords, NEW.text);
END;

CREATE TRIGGER trg_legal_references_fts_delete
AFTER DELETE ON legal_references
BEGIN
  DELETE FROM legal_reference_fts WHERE reference_id = OLD.id;
END;

CREATE TRIGGER trg_legal_references_fts_update
AFTER UPDATE ON legal_references
BEGIN
  DELETE FROM legal_reference_fts WHERE reference_id = OLD.id;
  INSERT INTO legal_reference_fts (reference_id, title, keywords, text)
  SELECT NEW.id, NEW.title, NEW.keywords, NEW.text
  WHERE NEW.active = 1;
END;

-- Core current Danish family-law references, verified against the linked official sources 2026-08-20.
-- Seed text is deliberately marked curated_summary: it is a retrieval aid, not a claim of verbatim statutory wording.
INSERT INTO legal_references (
  id, title, authority, source_url, locator, source_type, content_kind, version_label,
  published_at, verified_at, priority, keywords, text
) VALUES
(
  'fal-1-5',
  'Forældreansvarsloven – barnets bedste, beslutninger og barnets synspunkter',
  'Retsinformation / Socialministeriet',
  'https://www.retsinformation.dk/eli/lta/2026/662',
  '§§ 1, 3, 4 og 5',
  'law',
  'curated_summary',
  'LBK nr. 662 af 01/07/2026',
  '2026-07-16',
  '2026-08-20',
  10,
  'barn børn bedste trivsel beskyttelse vold samarbejdschikane forældrefremmedgørelse fælles forældremyndighed enighed væsentlige beslutninger dagligdag barnets mening ønsker synspunkter alder modenhed',
  'Den gældende forældreansvarslov sætter barnets bedste, trivsel og beskyttelse først. Ved fælles forældremyndighed kræver væsentlige beslutninger enighed, mens bopælsforælderen som udgangspunkt kan træffe beslutninger om overordnede forhold i barnets daglige liv, med særregler ved delt bopæl. Ved afgørelser om barnets bedste skal myndighederne også inddrage barnets ret til begge forældre og relevant samarbejdschikane. Barnets egne synspunkter skal tillægges vægt efter alder og modenhed.'
),
(
  'fal-17-18a',
  'Forældreansvarsloven – barnets bopæl og flytning',
  'Retsinformation / Socialministeriet',
  'https://www.retsinformation.dk/eli/lta/2026/662',
  '§§ 17, 18 og 18 a',
  'law',
  'curated_summary',
  'LBK nr. 662 af 01/07/2026',
  '2026-07-16',
  '2026-08-20',
  20,
  'bopæl adresse flytte flytning delt bopæl udland seks uger 6 uger varsling uenighed',
  'Ved uenighed mellem forældre med fælles forældremyndighed kan der træffes afgørelse om barnets bopæl, og en aftale eller afgørelse om bopæl kan ændres. En forælder, der vil ændre sin eller barnets bopæl, skal efter loven varsle den anden forælder senest 6 uger før flytningen. Forældre med fælles forældremyndighed kan aftale delt bopæl; loven regulerer også virkningen af at bringe en sådan aftale til ophør.'
),
(
  'fal-19-21a',
  'Forældreansvarsloven – samvær',
  'Retsinformation / Socialministeriet',
  'https://www.retsinformation.dk/eli/lta/2026/662',
  '§§ 19, 21 og 21 a',
  'law',
  'curated_summary',
  'LBK nr. 662 af 01/07/2026',
  '2026-07-16',
  '2026-08-20',
  10,
  'samvær weekend hente aflevere udlevere bytte ændre ændring ferie feriesamvær tidspunkt transport kontakt aflyse nægte stoppe erstatningssamvær aftale afgørelse',
  'Barnets forbindelse med begge forældre søges bevaret gennem samvær med den forælder, barnet ikke bor hos, og forældrene har fælles ansvar for samværet og transporten. Ved uenighed kan der træffes afgørelse om omfang og udøvelse ud fra en konkret vurdering af barnets forhold. Samvær kan afslås, ændres eller ophæves efter reglerne. Fastsat eller aftalt samvær bortfalder ikke blot ved en ensidig besked; bortfald kræver forældrenes aftale eller en relevant myndigheds-/retsafgørelse efter reglerne.'
),
(
  'fal-34-35-39',
  'Forældreansvarsloven – inddragelse af barnet og ændringsanmodninger',
  'Retsinformation / Socialministeriet',
  'https://www.retsinformation.dk/eli/lta/2026/662',
  '§§ 34, 35 og 39',
  'law',
  'curated_summary',
  'LBK nr. 662 af 01/07/2026',
  '2026-07-16',
  '2026-08-20',
  15,
  'barnets mening ønske ønsker børnesamtale initiativret 10 år ti år ændring væsentligt ændrede forhold samvær bopæl forældremyndighed',
  'Barnet skal inddrages i sager om forældremyndighed, bopæl og samvær, så barnets perspektiv kan komme frem, med lovens undtagelser hvor direkte inddragelse kan skade barnet eller er unødvendig. Et barn på 10 år eller mere har initiativret til at bede Familieretshuset indkalde forældrene til et møde om disse emner. En anmodning om ændring kan efter § 39 afvises, hvis forholdene ikke har ændret sig væsentligt, med den udtrykkelige undtagelse i bestemmelsen.'
),
(
  'frh-samvaer-aftale',
  'Ny aftale om samvær',
  'Familieretshuset',
  'https://familieretshuset.dk/emner/foraeldreansvar/samvaer/ny-aftale-om-samvaer/',
  'Aftale og ændring af samvær',
  'official_guidance',
  'curated_summary',
  'Familieretshuset, verificeret 20/08/2026',
  NULL,
  '2026-08-20',
  20,
  'samvær aftale ændre ændring bytte weekend skriftlig bindende væsentlige ændringer enig enige',
  'Familieretshuset oplyser, at forældre kan aftale ændringer af samværet. En skriftlig aftale mellem forældrene kan være bindende på samme måde som en aftale eller afgørelse fra Familieretshuset. Familieretshuset beskriver samtidig, at myndighedsændring af en eksisterende aftale normalt forudsætter væsentligt ændrede forhold.'
),
(
  'frh-foraeldremyndighed',
  'Hvad betyder forældremyndighed?',
  'Familieretshuset',
  'https://familieretshuset.dk/emner/foraeldreansvar/foraeldremyndighed/hvad-betyder-foraeldremyndighed/',
  'Fælles og ene forældremyndighed',
  'official_guidance',
  'curated_summary',
  'Familieretshuset, verificeret 20/08/2026',
  NULL,
  '2026-08-20',
  30,
  'forældremyndighed fælles ene skole pas religion vaccination væsentlige beslutninger bopælsforælder daglige liv',
  'Familieretshuset beskriver, at forældre med fælles forældremyndighed skal være enige om væsentlige beslutninger, mens bopælsforælderen som udgangspunkt kan bestemme en række forhold vedrørende barnets daglige liv. Ved ene forældremyndighed ligger de væsentlige beslutninger hos den pågældende forælder, mens spørgsmålet om samvær reguleres særskilt.'
),
(
  'frh-bopael-uenig',
  'Hvis forældrene ikke er enige om barnets bopæl',
  'Familieretshuset',
  'https://familieretshuset.dk/emner/foraeldreansvar/barnets-bopael/saadan-ansoeger-du-om-barnets-bopael-ikke-faelles/',
  'Uenighed og ændring af bopæl',
  'official_guidance',
  'curated_summary',
  'Familieretshuset, verificeret 20/08/2026',
  NULL,
  '2026-08-20',
  30,
  'bopæl adresse uenig uenighed familieretten ændre ændring væsentlige forhold barnets bedste',
  'Familieretshuset beskriver processen ved uenighed om barnets bopæl: hvis forældrene ikke finder en løsning, er det familieretten, der kan træffe den endelige afgørelse om bopæl. Siden beskriver også betydningen af væsentligt ændrede forhold ved anmodninger om ændring.'
),
(
  'vej-10090',
  'Forældreansvarsvejledningen',
  'Retsinformation / Social- og Boligministeriet',
  'https://www.retsinformation.dk/eli/retsinfo/2023/10090',
  'Generelle principper og sagsbehandling',
  'official_guidance',
  'curated_summary',
  'VEJ nr. 10090 af 11/12/2023 (gældende)',
  '2023-12-21',
  '2026-08-20',
  40,
  'vejledning familieretshuset familieretten samvær bopæl forældremyndighed konkret individuel vurdering barnets bedste sagsbehandling vold overgreb',
  'Forældreansvarsvejledningen uddyber reglerne om forældremyndighed, barnets bopæl, samvær og anden kontakt samt Familieretshusets behandling af sager. Vejledningen understreger konkret og individuel vurdering og gør opmærksom på, at nyere lovændringer kan være kommet til efter vejledningens udstedelse; den skal derfor altid læses sammen med gældende lov.'
),
(
  'domstol-familieret-guide',
  'Vejledning om familierettens behandling af forældreansvarssager',
  'Danmarks Domstole',
  'https://www.domstol.dk/media/zwbl1m21/vejledning-i-familieretssager.pdf',
  'Samvær, forældremyndighed og bopæl',
  'court_guidance',
  'curated_summary',
  'Danmarks Domstole, aktuel vejledning verificeret 20/08/2026',
  NULL,
  '2026-08-20',
  50,
  'familieretten domstol samvær bopæl forældremyndighed prøvelsessag afgørelse barnets bedste konkret vurdering',
  'Danmarks Domstoles vejledning beskriver familierettens behandling af sager om forældremyndighed, bopæl og samvær. Den fremhæver barnets bedste og den konkrete vurdering i samværssager og beskriver samspillet mellem Familieretshuset og familieretten.'
);

-- Public web evidence actually used for a message answer is snapshotted with that message.
CREATE TABLE message_web_sources (
  case_id TEXT NOT NULL,
  message_source_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('web_official', 'web_secondary')),
  cited_text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (case_id, message_source_id, source_id),
  FOREIGN KEY (case_id, message_source_id) REFERENCES case_sources(case_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_message_web_sources_message
  ON message_web_sources(case_id, message_source_id);

-- Extend usage telemetry so web research cost can be measured separately.
CREATE TABLE ai_usage_events_v2 (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  task_type TEXT NOT NULL CHECK (task_type IN ('message_analysis', 'message_review', 'document_analysis', 'web_research')),
  model TEXT NOT NULL,
  effort TEXT NOT NULL CHECK (effort IN ('medium', 'high')),
  input_tokens INTEGER NOT NULL CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL CHECK (output_tokens >= 0),
  cache_creation_input_tokens INTEGER NOT NULL CHECK (cache_creation_input_tokens >= 0),
  cache_read_input_tokens INTEGER NOT NULL CHECK (cache_read_input_tokens >= 0),
  thinking_tokens INTEGER NOT NULL CHECK (thinking_tokens >= 0),
  latency_ms INTEGER NOT NULL CHECK (latency_ms >= 0),
  context_characters INTEGER NOT NULL CHECK (context_characters >= 0),
  created_at TEXT NOT NULL,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

INSERT INTO ai_usage_events_v2 (
  id, case_id, task_type, model, effort, input_tokens, output_tokens,
  cache_creation_input_tokens, cache_read_input_tokens, thinking_tokens,
  latency_ms, context_characters, created_at
)
SELECT
  id, case_id, task_type, model, effort, input_tokens, output_tokens,
  cache_creation_input_tokens, cache_read_input_tokens, thinking_tokens,
  latency_ms, context_characters, created_at
FROM ai_usage_events;

DROP TABLE ai_usage_events;
ALTER TABLE ai_usage_events_v2 RENAME TO ai_usage_events;
CREATE INDEX idx_ai_usage_events_case_created
  ON ai_usage_events(case_id, created_at DESC);
