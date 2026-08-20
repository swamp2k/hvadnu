import type { MessageContextSource } from '../storage/d1-message-history-repository';

const MAX_WEB_SOURCES = 8;
const OFFICIAL_DANISH_DOMAINS = [
  'retsinformation.dk',
  'domstol.dk',
  'familieretshuset.dk',
  'ft.dk',
  'ankestyrelsen.dk',
  'ombudsmanden.dk',
  'civilstyrelsen.dk',
  'borger.dk',
];

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

function validHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function isOfficialDanishDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLocaleLowerCase('en-US');
    return OFFICIAL_DANISH_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

export function extractWebSources(content: unknown): MessageContextSource[] {
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
    const official = isOfficialDanishDomain(url);
    return {
      sourceId: `web:${index + 1}`,
      label: `${official ? 'Officiel webkilde' : 'Webkilde'}: ${source.title}`,
      sourceType: official ? 'web_official' : 'web_secondary',
      locator: url,
      text: source.snippets.join('\n\n'),
      status: 'unknown' as const,
    };
  });
}
