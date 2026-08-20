import { describe, expect, it } from 'vitest';
import { extractWebSources, isOfficialDanishDomain } from '../../src/server/web-source-extraction';

describe('web source extraction', () => {
  it('classifies official Danish domains without trusting lookalikes', () => {
    expect(isOfficialDanishDomain('https://www.domstol.dk/hoejesteret/aktuelt/2099/')).toBe(true);
    expect(isOfficialDanishDomain('https://www.retsinformation.dk/eli/lta/2099/123')).toBe(true);
    expect(isOfficialDanishDomain('https://domstol.dk.evil.example/decision')).toBe(false);
    expect(isOfficialDanishDomain('https://example.invalid/legal')).toBe(false);
  });

  it('keeps concrete cited web snippets and deduplicates URLs', () => {
    const sources = extractWebSources([
      {
        type: 'text',
        text: 'Synthetic research note',
        citations: [
          {
            type: 'web_search_result_location',
            url: 'https://www.domstol.dk/media/synthetic/anonym.pdf',
            title: 'Syntetisk afgørelse',
            cited_text: 'Dette er et syntetisk citeret uddrag.',
          },
          {
            type: 'web_search_result_location',
            url: 'https://www.domstol.dk/media/synthetic/anonym.pdf',
            title: 'Syntetisk afgørelse',
            cited_text: 'Dette er endnu et syntetisk uddrag.',
          },
          {
            type: 'web_search_result_location',
            url: 'https://example.invalid/article',
            title: 'Syntetisk kommentar',
            cited_text: 'Dette er sekundært syntetisk materiale.',
          },
        ],
      },
    ]);

    expect(sources).toHaveLength(2);
    expect(sources[0]).toMatchObject({
      sourceId: 'web:1',
      sourceType: 'web_official',
      status: 'unknown',
      locator: 'https://www.domstol.dk/media/synthetic/anonym.pdf',
    });
    expect(sources[0]?.text).toContain('endnu et syntetisk uddrag');
    expect(sources[1]?.sourceType).toBe('web_secondary');
  });

  it('ignores uncited prose and non-http citation targets', () => {
    expect(extractWebSources([
      { type: 'text', text: 'No citations', citations: null },
      {
        type: 'text',
        citations: [{ type: 'web_search_result_location', url: 'javascript:alert(1)', title: 'Bad', cited_text: 'Bad' }],
      },
    ])).toEqual([]);
  });
});
