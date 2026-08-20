import Anthropic from '@anthropic-ai/sdk';
import { toAiUsageMetadata, type AiUsageMetadata } from '../ai/usage';
import type { MessageContextSource } from '../storage/d1-message-history-repository';

const MAX_WEB_SOURCES = 8;
const OFFICIAL_LEGAL_DOMAINS = [
  'retsinformation.dk',
  'domstol.dk',
  'familieretshuset.dk',
  'ft.dk',
  'ankestyrelsen.dk',
  'ombudsmanden.dk',
  'civilstyrelsen.dk',
];

const LEGAL_TOPIC_RULES: Array<{ label: string; patterns: RegExp[] }> = [
  { label: 'samvær, ændring af samvær og transport', patterns: [/samvær/iu, /weekend/iu, /hent(?:e|er|ning)/iu, /aflever/iu, /udlever/iu, /feriesamvær/iu, /erstatningssamvær/iu] },
  { label: 'barnets bopæl, delt bopæl og flytning', patterns: [/\bbopæl/iu, /delt\s+bopæl/iu, /flyt(?:te|ning|ter)/iu, /adresse/iu] },
  { label: 'forældremyndighed og væsentlige beslutninger', patterns: [/forældremyndighed/iu, /væsentlig(?:e)?\s+beslut/iu, /\bpas\b/iu, /religion/iu, /vaccin/iu] },
  { label: 'barnets perspektiv, ønsker og inddragelse', patterns: [/barnets?\s+(?:ønske|mening|synspunkt)/iu, /børnesamtal/iu, /inddrag/iu, /initiativret/iu] },
  { label: 'beskyttelse mod vold, overgreb og anden skade', patterns: [/\bvold\b/iu, /overgreb/iu, /krisecenter/iu, /trussel/iu, /misbrug/iu] },
  { label: 'samarbejdschikane og forældrefremmedgørelse', patterns: [/samarbejdschikane/iu, /forældrefremmedgørelse/iu, /forældre-fremmedgørelse/iu] },
  { label: 'skole, sundhed og beslutningskompetence', patterns: [/\bskole/iu, /læge/iu, /sundhed/iu, /behandling/iu] },
  { label: 'udlandsrejse, ferie og flytning til udlandet', patterns: [/udland/iu, /udlandsrejse/iu, /ferie/iu, /grønland/iu, /færø/iu] },
  { label: 'børnebidrag, underhold og forsørgelse', patterns: [/børnebidrag/iu, /underhold/iu, /forsørg/iu, /bidrag/iu] },
  { label: 'bodeling, formue, bolig, indbo og gæld ved separation eller skilsmisse', patterns: [/bodeling/iu, /formuedeling/iu, /fælleseje/iu, /særeje/iu, /\bhus\b/iu, /bolig/iu, /ejendom/iu, /indbo/iu, /\bgæld\b/iu, /værdiansætt/iu, /skilsmisse/iu, /separation/iu] },
  { label: 'frister, familieretlig proces og fuldbyrdelse', patterns: [/\bfrist/iu, /deadline/iu, /fuldbyrd/iu, /familieret(?:ten)?/iu, /familieretshus/iu, /anke/iu, /klage/iu] },
  { label: 'dokumentation, bevis og skriftlige aftaler', patterns: [/dokumentation/iu, /\bbevis/iu, /skriftlig(?:e)?\s+aftale/iu, /aftale/iu, /afgørelse/iu] },
];

const WEB_RESEARCH_SYSTEM_PROMPT = `You are a research-only component for Hvad nu?, a Danish private family-law decision-support tool.

You receive only a deterministic, generic legal-topic brief. You do NOT receive the private message. Find current, relevant Danish legal material for those topics. Do not answer the private case and do not make a case-specific legal conclusion.

Search rules:
1. Keep every web-search query generic. Never attempt to infer or reconstruct personal names, addresses, phone numbers, email addresses, case numbers, exact private quotes, children's names, or other identifying details.
2. Prioritize primary and official Danish sources: Retsinformation, Danmarks Domstole, Familieretshuset, Folketinget, Ankestyrelsen, Folketingets Ombudsmand and Civilstyrelsen.
3. Look for relevant published court decisions and legislative materials when they can clarify how a rule has been applied.
4. Secondary legal commentary may be used only as supplementary material, never as the sole authority for a legal rule.
5. Prefer current sources and select sources that make it possible to see when an older decision concerns an older version of the law.
6. Return a short research note whose useful factual statements are cited. The application discards your prose and retains only the actual cited source snippets, titles and URLs.`;

interface WebCitationLike {
  type?: unknown;
  url?: unknown;
  title?: unknown;
  cited_text?: unknown;
}

interface TextBlockLike {
  type?: unknown;
  citations?: unknown;
}

export interface WebResearchResult {
  sources: MessageContextSource[];
  usage: AiUsageMetadata;
}

export interface WebResearchProvider {
  research(message: string): Promise<WebResearchResult>;
}

export class AnthropicWebResearchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnthropicWebResearchError';
  }
}

export function buildSafeLegalResearchBrief(message: string): string {
  const cleanMessage = message.trim();
  if (!cleanMessage) throw new AnthropicWebResearchError('Message is empty.');
  const topics = LEGAL_TOPIC_RULES
    .filter((rule) => rule.patterns.some((pattern) => pattern.test(cleanMessage)))
    .map((rule) => rule.label)
    .slice(0, 8);
  const selected = topics.length > 0 ? topics : ['generel dansk familie- og forældreansvarsret'];
  return `Dansk juridisk research. Emner: ${selected.join('; ')}. Find gældende regler, relevante officielle vejledninger, lovforarbejder og publicerede domstolsafgørelser. Prioritér aktuelle primærkilder og gør ældre praksis sporbar til den lovversion, den vedrører.`;
}

function validHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function isOfficialLegalDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLocaleLowerCase('en-US');
    return OFFICIAL_LEGAL_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

export function extractWebResearchSources(content: unknown): MessageContextSource[] {
  if (!Array.isArray(content)) return [];
  const byUrl = new Map<string, { title: string; snippets: string[] }>();

  for (const rawBlock of content) {
    const block = rawBlock as TextBlockLike;
    if (block?.type !== 'text' || !Array.isArray(block.citations)) continue;
    for (const rawCitation of block.citations) {
      const citation = rawCitation as WebCitationLike;
      if (citation?.type !== 'web_search_result_location') continue;
      const url = validHttpUrl(citation.url);
      const citedText = typeof citation.cited_text === 'string' ? citation.cited_text.trim() : '';
      if (!url || !citedText) continue;
      const title = typeof citation.title === 'string' && citation.title.trim()
        ? citation.title.trim()
        : new URL(url).hostname;
      const existing = byUrl.get(url) ?? { title, snippets: [] };
      if (!existing.snippets.includes(citedText)) existing.snippets.push(citedText);
      byUrl.set(url, existing);
    }
  }

  return [...byUrl.entries()].slice(0, MAX_WEB_SOURCES).map(([url, source], index) => {
    const official = isOfficialLegalDomain(url);
    return {
      sourceId: `web:${index + 1}`,
      label: `${official ? 'Officiel webkilde' : 'Sekundær webkilde'}: ${source.title}`,
      sourceType: official ? 'web_official' : 'web_secondary',
      locator: url,
      text: source.snippets.join('\n\n'),
      status: 'unknown' as const,
    };
  });
}

export function createAnthropicWebResearchProvider(apiKey: string): WebResearchProvider {
  const trimmedKey = apiKey.trim();
  if (!trimmedKey) throw new AnthropicWebResearchError('Anthropic API key is missing.');
  const client = new Anthropic({ apiKey: trimmedKey });

  return {
    async research(message: string) {
      const prompt = buildSafeLegalResearchBrief(message);
      const startedAt = Date.now();
      const response = await client.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 1600,
        system: WEB_RESEARCH_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
        output_config: { effort: 'medium' },
      });
      if (response.stop_reason === 'refusal') throw new AnthropicWebResearchError('Claude refused web research.');
      if (response.stop_reason === 'pause_turn') throw new AnthropicWebResearchError('Web research did not complete in one turn.');
      return {
        sources: extractWebResearchSources(response.content),
        usage: toAiUsageMetadata({
          taskType: 'web_research',
          effort: 'medium',
          usage: response.usage,
          latencyMs: Date.now() - startedAt,
          contextCharacters: prompt.length,
        }),
      };
    },
  };
}
