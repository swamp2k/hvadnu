import { z } from 'zod';
import { buildDocumentAnalysisPrompt, type DocumentAnalysisPromptEnvelope } from '../ai/document-analysis-prompt';
import type { AiUsageMetadata } from '../ai/usage';
import {
  DocumentExplanationPayloadSchema,
  DocumentExplanationSchema,
  ExtractedDocumentSchema,
  type DocumentExplanation,
  type ExtractedDocument,
} from '../domain/document';

export const DOCUMENT_ANALYSIS_MODEL = 'claude-sonnet-5' as const;
export const MAX_SINGLE_DOCUMENT_ANALYSIS_CHARACTERS = 120_000;

export const DocumentAnalysisGateSchema = z.object({
  enabled: z.boolean(),
  authenticationEnforced: z.boolean(),
  serverSideSecretConfigured: z.boolean(),
});

export type DocumentAnalysisGate = z.infer<typeof DocumentAnalysisGateSchema>;

export const CLOSED_DOCUMENT_ANALYSIS_GATE: DocumentAnalysisGate = {
  enabled: false,
  authenticationEnforced: false,
  serverSideSecretConfigured: false,
};

export interface GateEvaluation {
  allowed: boolean;
  blockers: string[];
}

export function evaluateDocumentAnalysisGate(gate: DocumentAnalysisGate): GateEvaluation {
  const blockers: string[] = [];
  if (!gate.enabled) blockers.push('document analysis is not enabled');
  if (!gate.authenticationEnforced) blockers.push('authentication is not enforced');
  if (!gate.serverSideSecretConfigured) blockers.push('server-side Anthropic secret is not configured');
  return { allowed: blockers.length === 0, blockers };
}

export interface DocumentAnalysisProvider {
  analyze(args: {
    model: typeof DOCUMENT_ANALYSIS_MODEL;
    prompt: DocumentAnalysisPromptEnvelope;
  }): Promise<{ payload: unknown; usage: AiUsageMetadata }>;
}

export class DocumentAnalysisBlockedError extends Error {
  readonly blockers: string[];

  constructor(blockers: string[]) {
    super(`Document analysis is blocked: ${blockers.join('; ')}`);
    this.name = 'DocumentAnalysisBlockedError';
    this.blockers = blockers;
  }
}

export class DocumentRequiresChunkingError extends Error {
  constructor(characterCount: number) {
    super(`Document has ${characterCount} characters; single-pass analysis is limited to ${MAX_SINGLE_DOCUMENT_ANALYSIS_CHARACTERS}.`);
    this.name = 'DocumentRequiresChunkingError';
  }
}

export interface DocumentAnalysisService {
  analyze(document: ExtractedDocument): Promise<{ analysis: DocumentExplanation; usage: AiUsageMetadata }>;
}

function constrainSingleDocumentStatus(payload: z.infer<typeof DocumentExplanationPayloadSchema>) {
  if (payload.sourceStatus !== 'current' && payload.sourceStatus !== 'superseded') return payload;

  return {
    ...payload,
    sourceStatus: 'unknown' as const,
    uncertainty: [
      ...payload.uncertainty,
      'Et enkelt dokument kan ikke alene fastslå, om det stadig gælder eller senere er blevet erstattet.',
    ],
  };
}

export function createDocumentAnalysisService(
  gateInput: DocumentAnalysisGate,
  provider: DocumentAnalysisProvider,
): DocumentAnalysisService {
  const gate = DocumentAnalysisGateSchema.parse(gateInput);

  return {
    async analyze(documentInput) {
      const evaluation = evaluateDocumentAnalysisGate(gate);
      if (!evaluation.allowed) throw new DocumentAnalysisBlockedError(evaluation.blockers);

      const document = ExtractedDocumentSchema.parse(documentInput);
      const actualCharacterCount = document.pages.reduce((sum, page) => sum + page.text.length, 0);
      if (actualCharacterCount > MAX_SINGLE_DOCUMENT_ANALYSIS_CHARACTERS) {
        throw new DocumentRequiresChunkingError(actualCharacterCount);
      }

      const providerResult = await provider.analyze({
        model: DOCUMENT_ANALYSIS_MODEL,
        prompt: buildDocumentAnalysisPrompt(document),
      });

      const payload = constrainSingleDocumentStatus(DocumentExplanationPayloadSchema.parse(providerResult.payload));
      return {
        analysis: DocumentExplanationSchema.parse({ mode: 'model_analysis', ...payload }),
        usage: providerResult.usage,
      };
    },
  };
}
