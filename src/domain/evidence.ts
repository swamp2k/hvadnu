import { z } from 'zod';

const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, 'Expected YYYY-MM-DD');

export const AssertionKindSchema = z.enum([
  'fact',
  'claim',
  'agreement',
  'decision',
  'proposal',
  'interpretation',
]);

export const EvidenceStatusSchema = z.enum([
  'current',
  'superseded',
  'disputed',
  'unknown',
]);

export const SourceTypeSchema = z.enum([
  'message',
  'agreement',
  'decision',
  'lawyer_letter',
  'authority_guidance',
  'other_document',
]);

export const SourceRefSchema = z.object({
  sourceId: z.string().min(1),
  page: z.number().int().positive().optional(),
  messageId: z.string().min(1).optional(),
  excerpt: z.string().min(1).max(600).optional(),
});

export const EvidenceAssertionSchema = z.object({
  id: z.string().min(1),
  kind: AssertionKindSchema,
  statement: z.string().min(1),
  status: EvidenceStatusSchema,
  assertedBy: z.string().min(1).optional(),
  effectiveFrom: IsoDateSchema.optional(),
  sourceRefs: z.array(SourceRefSchema).min(1),
});

export const SourceRecordSchema = z.object({
  id: z.string().min(1),
  type: SourceTypeSchema,
  title: z.string().min(1),
  occurredAt: z.string().min(1),
  importedAt: z.string().min(1).optional(),
  immutableSha256: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
  status: EvidenceStatusSchema,
  supersedesSourceIds: z.array(z.string().min(1)).default([]),
});

export type AssertionKind = z.infer<typeof AssertionKindSchema>;
export type EvidenceStatus = z.infer<typeof EvidenceStatusSchema>;
export type SourceRef = z.infer<typeof SourceRefSchema>;
export type EvidenceAssertion = z.infer<typeof EvidenceAssertionSchema>;
export type SourceRecord = z.infer<typeof SourceRecordSchema>;
