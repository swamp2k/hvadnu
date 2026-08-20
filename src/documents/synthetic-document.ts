import { DocumentExplanationSchema, type DocumentExplanation } from '../domain/document';

export const SYNTHETIC_DOCUMENT_TEXT = `Forslag til ændring af samvær\n\nVores klient foreslår, at samværet fremover begynder torsdag kl. 16.00 i stedet for fredag kl. 17.00.\n\nVi beder om skriftlig bekræftelse på, om forslaget accepteres senest den 15. september 2026.\n\nIndtil en eventuel aftale foreligger, er dette brev alene et forslag fra vores klient.`;

export function explainSyntheticDocument(): DocumentExplanation {
  return DocumentExplanationSchema.parse({
    mode: 'synthetic_demo',
    title: 'Forslag fra den anden parts advokat',
    documentType: 'lawyer_letter',
    sourceStatus: 'proposal',
    summary: 'Brevet foreslår at flytte starten på samværet fra fredag kl. 17 til torsdag kl. 16. Det fremgår udtrykkeligt, at brevet er et forslag og ikke en allerede indgået aftale.',
    whatItMeans: [
      'Dokumentet dokumenterer, at den anden part ønsker en ændring.',
      'Dokumentet dokumenterer ikke i sig selv, at ændringen er accepteret eller gældende.',
      'Den eksisterende ordning bør derfor ikke markeres som erstattet alene på baggrund af dette brev.',
    ],
    actions: [
      'Tag stilling til om forslaget skal accepteres, afvises eller drøftes.',
      'Kontrollér om der findes et senere svar eller en senere aftale, før current-state ændres.',
    ],
    deadlines: [
      { label: 'Anmodet svarfrist', date: '2026-09-15', source: 'syntetisk dokument · afsnit 3' },
    ],
    importantPassages: [
      { text: 'Vores klient foreslår, at samværet fremover begynder torsdag kl. 16.00.', locator: 'afsnit 2' },
      { text: 'Indtil en eventuel aftale foreligger, er dette brev alene et forslag fra vores klient.', locator: 'afsnit 4' },
    ],
    uncertainty: [
      'Demoen indeholder ikke et efterfølgende svar, så det kan ikke afgøres her, om forslaget senere blev accepteret.',
      'Fristen er en anmodet svarfrist i brevet; demoen fastslår ikke, at den er en lovbestemt eller retsligt bindende frist.',
    ],
  });
}
