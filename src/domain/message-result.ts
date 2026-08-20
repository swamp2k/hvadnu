import { z } from 'zod';

export const AssessmentLevelSchema = z.enum([
  'supported',
  'uncertain',
  'not_supported',
  'attention',
]);

export const CitationStatusSchema = z.enum([
  'current',
  'superseded',
  'disputed',
  'unknown',
]);

export const MessageCitationSchema = z.object({
  sourceId: z.string().min(1),
  label: z.string().min(1),
  status: CitationStatusSchema,
  locator: z.string().min(1).optional(),
});

const MessageAnalysisCoreSchema = z.object({
  summary: z.string().min(1),
  replyNeeded: z.array(z.string().min(1)),
  canIgnore: z.array(z.string().min(1)),
  caseContext: z.array(z.object({
    text: z.string().min(1),
    sourceIds: z.array(z.string().min(1)).min(1),
  })),
  legalAssessment: z.object({
    level: AssessmentLevelSchema,
    title: z.string().min(1),
    explanation: z.string().min(1),
    sourceIds: z.array(z.string().min(1)),
  }),
  communicationAssessment: z.object({
    title: z.string().min(1),
    explanation: z.string().min(1),
  }),
  suggestedReply: z.string().min(1),
  uncertainty: z.object({
    level: z.enum(['low', 'medium', 'high']),
    missing: z.array(z.string().min(1)),
  }),
  citations: z.array(MessageCitationSchema),
});

export const MessageAnalysisPayloadSchema = MessageAnalysisCoreSchema;

export const MessageAnalysisResultSchema = MessageAnalysisCoreSchema.extend({
  mode: z.enum(['synthetic_demo', 'model_analysis']),
  reviewPlan: z.object({
    model: z.literal('claude-sonnet-5'),
    passes: z.union([z.literal(1), z.literal(2)]),
    humanReviewRecommended: z.boolean(),
    reasons: z.array(z.string()),
  }),
});

export const MessageHistoryEntrySchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().datetime(),
  message: z.string().min(1),
  analysis: MessageAnalysisResultSchema.refine((value) => value.mode === 'model_analysis', {
    message: 'Message history may only contain production model analyses.',
  }),
});

export type MessageAnalysisPayload = z.infer<typeof MessageAnalysisPayloadSchema>;
export type MessageAnalysisResult = z.infer<typeof MessageAnalysisResultSchema>;
export type MessageCitation = z.infer<typeof MessageCitationSchema>;
export type MessageHistoryEntry = z.infer<typeof MessageHistoryEntrySchema>;
