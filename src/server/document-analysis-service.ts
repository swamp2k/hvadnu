import { z } from 'zod';
import {
  DocumentExplanationPayloadSchema,
  DocumentExplanationSchema,
  type DocumentExplanation,
  type ExtractedDocument,
} from '../domain/document';
import { buildDocumentAnalysisPrompt, type DocumentAnalysisPromptEnvelope } from '../ai/document-analysis-prompt';

export const DOCUMENT_ANALYSIS_MODEL = 'claude-sonnet-5' as const;
export const MAX_SINGLE_DOCUMENT_ANALYSIS_CHARACTERS = 120_000;

export const DocumentAnalysisGateSchema = z.object({
  enabled: z.boolean(),
  authenticationEnforced: z.boolean(),
  privateDeployment: z.boolean(),
  anthropicRetentionApproved: z.boolean(),
  serverSideSecretConfigured: z.boolean(),
  payloadLoggingDisabled: z.boolean(),
});

export type DocumentAnalysisGate = z.infer<typeof DocumentAnalysisGateSchema>;

export const CLOSED_DOCUMENT_ANALYSIS_GATE: DocumentAnalysisGate = {
  enabled: false,
  authenticationEnforced: false,
  privateDeployment: false,
  anthropicRetentionApproved: false,
  serverSideSecretConfigured: false,
  payloadLoggingDisabled: false,
};

export interface GateEvaluation {
  allowed: boolean;
  blockers: string[];
}

export function evaluateDocumentAnalysisGate(gate: DocumentAnalysisGate): GateEvaluation {
  const blockers: string[] = [];
  if (!gate.enabled) blockers.push('document analysis is not enabled');
  if (!gate.authenticationEnforced) blockers.push('authentication is not enforced');
  if (!gate.privateDeployment) blockers.push('deployment is not approved for private case data');
  if (!gate.anthropicRetentionApproved) blockers.push('Anthropic retention/data processing is not approved');
  if (!gate.serverSideSecretConfigured) blockers.push('server-side Anthropic secret is not configured');
  if (!gate.payloadLoggingDisabled) blockers.push('payload logging is not confirmed disabled');
  return { allowed: blockers.length === 0, blockers };
}

export interface DocumentAnalysisProvider {
  analyze(args: {
    model: typeof DOCUMENT_ANALYSIS_MODEL;
    prompt: DocumentAnalysisPromptEnvelope;
  }): Promise<unknown>;
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
  analyze(document: ExtractedDocument): Promise<DocumentExplanation>;
}

export function createDocumentAnalysisService(
  gateInput: DocumentAnalysisGate,
  provider: DocumentAnalysisProvider,
): DocumentAnalysisService {
  const gate = DocumentAnalysisGateSchema.parse(gateInput);

  return {
    async analyze(document) {
      const evaluation = evaluateDocumentAnalysisGate(gate);
      if (!evaluation.allowed) throw new DocumentAnalysisBlockedError(evaluation.blockers);

      if (document.characterCount > MAX_SINGLE_DOCUMENT_ANALYSIS_CHARACTERS) {
        throw new DocumentRequiresChunkingError(document.characterCount);
      }

      const raw = await provider.analyze({
        model: DOCUMENT_ANALYSIS_MODEL,
        prompt: buildDocumentAnalysisPrompt(document),
      });

      const payload = DocumentExplanationPayloadSchema.parse(raw);
      return DocumentExplanationSchema.parse({ mode: 'model_analysis', ...payload });
    },
  };
}
