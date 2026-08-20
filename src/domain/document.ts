import { z } from 'zod';

export const DocumentKindSchema = z.enum(['pdf', 'docx', 'text']);
export type DocumentKind = z.infer<typeof DocumentKindSchema>;

export const ExtractedPageSchema = z.object({
  pageNumber: z.number().int().positive(),
  text: z.string(),
});

export const ExtractedDocumentSchema = z.object({
  name: z.string().min(1),
  mimeType: z.string(),
  kind: DocumentKindSchema,
  sizeBytes: z.number().int().nonnegative(),
  pageCount: z.number().int().positive(),
  characterCount: z.number().int().nonnegative(),
  pages: z.array(ExtractedPageSchema).min(1),
  warnings: z.array(z.string()),
});

export type ExtractedDocument = z.infer<typeof ExtractedDocumentSchema>;

export const DocumentExplanationPayloadSchema = z.object({
  title: z.string().min(1),
  documentType: z.enum(['agreement', 'decision', 'lawyer_letter', 'other']),
  sourceStatus: z.enum(['current', 'superseded', 'proposal', 'disputed', 'unknown']),
  summary: z.string().min(1),
  whatItMeans: z.array(z.string()),
  actions: z.array(z.string()),
  deadlines: z.array(z.object({ label: z.string(), date: z.string().optional(), source: z.string() })),
  importantPassages: z.array(z.object({ text: z.string(), locator: z.string() })),
  uncertainty: z.array(z.string()),
});

export const DocumentExplanationSchema = DocumentExplanationPayloadSchema.extend({
  mode: z.enum(['synthetic_demo', 'model_analysis']),
});

export type DocumentExplanationPayload = z.infer<typeof DocumentExplanationPayloadSchema>;
export type DocumentExplanation = z.infer<typeof DocumentExplanationSchema>;
