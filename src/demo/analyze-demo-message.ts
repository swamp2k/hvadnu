import { buildReviewPlan } from '../ai/routing';
import { MessageAnalysisResultSchema, type MessageAnalysisResult } from '../domain/message-result';
import { citationsFor } from './synthetic-case';

const CURRENT_AGREEMENT = 'doc-2025-current-contact';
const LAWYER_PROPOSAL = 'doc-2026-lawyer-proposal';
const OTHER_PARENT_MESSAGE = 'msg-2026-08-01-parent-b';

function finalise(result: Omit<MessageAnalysisResult, 'mode'>): MessageAnalysisResult {
  return MessageAnalysisResultSchema.parse({ mode: 'synthetic_demo', ...result });
}

export function analyzeDemoMessage(message: string): MessageAnalysisResult {
  const normalized = message.trim().toLocaleLowerCase('da-DK');

  if (/spejder|lejr|aflyser dit samvær/.test(normalized)) {
    const sourceIds = [CURRENT_AGREEMENT];
    return finalise({
      summary: 'Beskeden handler om at ændre en planlagt samværsweekend på grund af spejderlejr.',
      replyNeeded: [
        'Om den anden forælder vil acceptere en konkret ændring af den aktuelle weekend.',
        'Hvordan den alternative løsning i så fald skal se ud.',
      ],
      canIgnore: [
        'Påstanden om at spejderlejren i sig selv automatisk giver ret til at aflyse samværet er ikke dokumenteret i demo-sagen.',
      ],
      caseContext: [
        {
          text: 'Den seneste demo-aftale siger, at weekend-samvær starter fredag kl. 17, og at ændringer kræver skriftlig aftale.',
          sourceIds,
        },
      ],
      legalAssessment: {
        level: 'not_supported',
        title: 'Retten til ensidigt at aflyse er ikke dokumenteret',
        explanation: 'Demo-materialet indeholder ingen aktuel juridisk kilde, der siger, at spejderlejr automatisk tilsidesætter den gældende samværsaftale. Det sikre er derfor ikke at fremstille aflysningen som en fast rettighed.',
        sourceIds,
      },
      communicationAssessment: {
        title: 'Gør det til et konkret forslag i stedet for en afgørelse',
        explanation: 'En kort forespørgsel om at bytte eller flytte weekenden holder fokus på børnene og undgår at gøre en usikker juridisk påstand til konfliktstof.',
      },
      suggestedReply: 'Der er spejderlejr den weekend, som børnene gerne vil deltage i. Kan vi aftale at flytte eller bytte samværet, så begge dele kan lade sig gøre?',
      uncertainty: {
        level: 'high',
        missing: [
          'En aktuel juridisk kilde om betydningen af barnets aktivitet i en allerede aftalt samværsweekend.',
          'Eventuelle senere aftaler eller afgørelser om netop denne type ændringer.',
        ],
      },
      reviewPlan: buildReviewPlan({
        riskLevel: 'high',
        legalUncertainty: 'high',
        evidenceSufficiency: 'insufficient',
        conflictingSources: false,
        bindingDeadlineDetected: false,
      }),
      citations: citationsFor(sourceIds),
    });
  }

  if (/torsdag|kl\.\s*16|16[:.]00|uanset om du kan lide/.test(normalized)) {
    const sourceIds = [CURRENT_AGREEMENT, LAWYER_PROPOSAL, OTHER_PARENT_MESSAGE];
    return finalise({
      summary: 'Den anden forælder hævder, at afhentningen er ændret fra fredag til torsdag, og varsler at hente børnene på det tidspunkt.',
      replyNeeded: [
        'Om der faktisk findes en nyere skriftlig aftale, der ændrer afhentningstidspunktet.',
        'Det konkrete tidspunkt for afhentning i den nuværende ordning.',
      ],
      canIgnore: [
        'Formuleringen “uanset om du kan lide det eller ej” behøver ikke besvares.',
      ],
      caseContext: [
        {
          text: 'Den aktuelle demo-aftale siger fredag kl. 17 og kræver skriftlig aftale om ændringer.',
          sourceIds: [CURRENT_AGREEMENT],
        },
        {
          text: 'Et senere advokatbrev foreslår torsdag kl. 16, men demo-sagen indeholder ingen accept af forslaget.',
          sourceIds: [LAWYER_PROPOSAL],
        },
        {
          text: 'SMS’en hævder, at ændringen er aftalt. Selve påstanden dokumenterer ikke, at der findes en aftale.',
          sourceIds: [OTHER_PARENT_MESSAGE],
        },
      ],
      legalAssessment: {
        level: 'attention',
        title: 'Torsdagsændringen er ikke dokumenteret i demo-sagen',
        explanation: 'Det stærkeste aktuelle kildemateriale i demoen peger fortsat på fredag kl. 17. Advokatbrevet er markeret som et forslag, og SMS’en som en parts påstand. En juridisk vurdering af en eventuel ensidig afhentning kræver desuden aktuelle retskilder, som demoen ikke indeholder.',
        sourceIds,
      },
      communicationAssessment: {
        title: 'Svar på tidspunktet — ikke på provokationen',
        explanation: 'Et neutralt svar bør fastholde den dokumenterede ordning og samtidig åbne for, at en nyere aftale kan fremlægges, hvis den findes.',
      },
      suggestedReply: 'Jeg kan ikke se, at vi har en skriftlig aftale om torsdag. Den seneste aftale, jeg har, siger fredag kl. 17. Hvis du mener, der findes en nyere aftale, så send den gerne.',
      uncertainty: {
        level: 'high',
        missing: [
          'Dokumentation for at advokatforslaget om torsdag blev accepteret.',
          'Aktuel juridisk kilde om håndtering af en varslet ensidig ændring.',
        ],
      },
      reviewPlan: buildReviewPlan({
        riskLevel: 'high',
        legalUncertainty: 'high',
        evidenceSufficiency: 'partial',
        conflictingSources: true,
        bindingDeadlineDetected: false,
      }),
      citations: citationsFor(sourceIds),
    });
  }

  return finalise({
    summary: 'Demoen kan læse beskeden, men den matcher ikke sikkert et af de syntetiske scenarier.',
    replyNeeded: ['Identificér først det konkrete spørgsmål eller krav, der faktisk skal besvares.'],
    canIgnore: [],
    caseContext: [],
    legalAssessment: {
      level: 'uncertain',
      title: 'For lidt sagskontekst til en sikker vurdering',
      explanation: 'M1-demoen må ikke improvisere juridiske konklusioner for vilkårlige beskeder. Den kræver et kendt syntetisk scenarie eller senere rigtig retrieval og aktuelle juridiske kilder.',
      sourceIds: [],
    },
    communicationAssessment: {
      title: 'Hold svaret på pause, hvis du ikke ved hvad der faktisk kræves',
      explanation: 'Det er bedre at få de relevante kilder frem end at besvare en konfliktfyldt besked ud fra gæt.',
    },
    suggestedReply: 'Jeg vender tilbage, når jeg har fået afklaret, hvad der konkret skal tages stilling til.',
    uncertainty: {
      level: 'high',
      missing: ['Relevante dokumenter, historik og aktuelle juridiske kilder for den konkrete besked.'],
    },
    reviewPlan: buildReviewPlan({
      riskLevel: 'medium',
      legalUncertainty: 'high',
      evidenceSufficiency: 'insufficient',
      conflictingSources: false,
      bindingDeadlineDetected: false,
    }),
    citations: [],
  });
}
