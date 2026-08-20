import { z } from 'zod';

export const CaseQueryPayloadSchema = z.object({
  answer: z.string().min(1),
  caseEvidenceFound: z.boolean(),
  caseSourceIds: z.array(z.string().min(1)),
});

export const CaseQuerySourceSchema = z.object({
  label: z.string().min(1),
  locator: z.string().min(1).optional(),
  kind: z.enum(['case', 'web']),
});

export const CaseQueryResultSchema = CaseQueryPayloadSchema.extend({
  sources: z.array(CaseQuerySourceSchema),
});

export type CaseQueryPayload = z.infer<typeof CaseQueryPayloadSchema>;
export type CaseQueryResult = z.infer<typeof CaseQueryResultSchema>;
