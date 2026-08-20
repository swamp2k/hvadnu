import { describe, expect, it } from 'vitest';
import {
  buildSafeLegalResearchBrief,
  extractWebResearchSources,
  isOfficialLegalDomain,
} from '../../src/server/anthropic-web-research-provider';

describe('legal web research source normalization', () => {
  it('builds web-search input only from fixed legal topic labels, never raw private details', () => {
    const brief = buildSafeLegalResearchBrief(
      'Syntetisk Person skriver i sag BS-12345/2099/XYZ at samværet skal stoppes. Ring 11 22 33 44.',
    );
    expect(brief).toContain('samvær');
    expect(brief).not.toContain('Syntetisk Person');
    expect(brief).not.toContain('BS-12345');
    expect(brief).not.toContain('11 22 33 44');
    expect(brief).not.toContain('skal stoppes');
  });

  it('maps property disputes to generic family-property research without leaking wording', () => {
    const brief = buildSafeLegalResearchBrief('Syntetisk Part mener huset er 2.900.000 værd og kræver bestemt indbo.');
    expect(brief).toContain('bodeling');
    expect(brief).not.toContain('Syntetisk Part');
    expect(brief).not.toContain('2.900.000');
  });

  it('classifies official Danish legal domains without trusting lookalikes', () => {
    expect(isOfficialLegalDomain('https://www.domstol.dk/hoejesteret/aktuelt/2026/')).toBe(true);
    expect(isOfficialLegalDomain('https://www.retsinformation.dk/eli/lta/2026/662')).toBe(true);
    expect(isOfficialLegalDomain('https://domstol.dk.evil.example/decision')).toBe(false);
    expect(isOfficialLegalDomain('https://example.invalid/legal')).toBe(false);
  });

  it('keeps only concrete cited web snippets and deduplicates URLs', () => {
    const sources = extractWebResearchSources([
      {
        type: 'text',
        text: 'Synthetic research note',
        citations: [
          {
            type: 'web_search_result_location',
            url: 'https://www.domstol.dk/media/example/anonym.pdf',
            title: 'Højesterets afgørelse',
            cited_text: 'Retten lagde vægt på barnets bedste.',
          },
          {
            type: 'web_search_result_location',
            url: 'https://www.domstol.dk/media/example/anonym.pdf',
            title: 'Højesterets afgørelse',
            cited_text: 'Afgørelsen beroede på en konkret vurdering.',
          },
          {
            type: 'web_search_result_location',
            url: 'https://law-blog.example/article',
            title: 'Kommentar',
            cited_text: 'Dette er sekundær juridisk kommentar.',
          },
        ],
      },
    ]);

    expect(sources).toHaveLength(2);
    expect(sources[0]).toMatchObject({
      sourceId: 'web:1',
      sourceType: 'web_official',
      status: 'unknown',
      locator: 'https://www.domstol.dk/media/example/anonym.pdf',
    });
    expect(sources[0]?.text).toContain('konkret vurdering');
    expect(sources[1]?.sourceType).toBe('web_secondary');
  });

  it('ignores uncited prose and non-http citation targets', () => {
    expect(extractWebResearchSources([
      { type: 'text', text: 'No citations', citations: null },
      {
        type: 'text',
        citations: [{ type: 'web_search_result_location', url: 'javascript:alert(1)', title: 'Bad', cited_text: 'Bad' }],
      },
    ])).toEqual([]);
  });
});
