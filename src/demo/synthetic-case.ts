import type { MessageCitation } from '../domain/message-result';

export interface DemoSource extends MessageCitation {
  text: string;
}

export const DEMO_SOURCES: Record<string, DemoSource> = {
  'doc-2025-current-contact': {
    sourceId: 'doc-2025-current-contact',
    label: 'Gældende demo-samværsaftale · 12. april 2025',
    status: 'current',
    locator: 'afsnit om weekend-samvær',
    text: 'Børnene er hos Forælder B hver anden weekend fra fredag kl. 17:00 til søndag kl. 18:00. Ændringer kræver skriftlig aftale mellem forældrene.',
  },
  'doc-2026-lawyer-proposal': {
    sourceId: 'doc-2026-lawyer-proposal',
    label: 'Advokatbrev · 3. juni 2026',
    status: 'unknown',
    locator: 'forslag om ændret afhentning',
    text: 'Forælder B foreslår, at fremtidigt samvær begynder torsdag kl. 16:00. Brevet beder om bekræftelse på, om forslaget accepteres.',
  },
  'msg-2026-08-01-parent-b': {
    sourceId: 'msg-2026-08-01-parent-b',
    label: 'Demo-SMS fra den anden forælder · 1. august 2026',
    status: 'unknown',
    text: 'Vi har aftalt, at jeg har dem fra torsdag nu. Jeg henter dem kl. 16, uanset om du kan lide det eller ej.',
  },
};

export const DEMO_MESSAGES = {
  changedPickup: 'Vi har aftalt, at jeg har dem fra torsdag nu. Jeg henter dem kl. 16, uanset om du kan lide det eller ej.',
  scoutCamp: 'Børnene skal på spejderlejr den weekend, så jeg aflyser dit samvær. Det må jeg godt.',
} as const;

export function citationsFor(sourceIds: string[]): MessageCitation[] {
  return sourceIds
    .map((sourceId) => DEMO_SOURCES[sourceId])
    .filter((source): source is DemoSource => source !== undefined)
    .map(({ text: _text, ...citation }) => citation);
}
