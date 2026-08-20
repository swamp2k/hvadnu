import { z } from 'zod';
import { SourceRefSchema } from './evidence';

export const CurrentStateAuthoritySchema = z.enum([
  'court_or_authority_decision',
  'signed_party_agreement',
  'confirmed_party_agreement',
  'lawyer_position',
  'party_claim',
  'unknown',
]);

export const CurrentStateStatusSchema = z.enum([
  'candidate',
  'confirmed',
  'rejected',
  'superseded',
]);

export const CurrentStateEntrySchema = z.object({
  id: z.string().min(1),
  topic: z.string().min(1),
  summary: z.string().min(1),
  authority: CurrentStateAuthoritySchema,
  status: CurrentStateStatusSchema,
  sourceRefs: z.array(SourceRefSchema).min(1),
  supersedesEntryIds: z.array(z.string().min(1)).default([]),
  proposedBy: z.enum(['ai', 'deterministic_rule', 'user']),
  confirmedBy: z.enum(['deterministic_rule', 'user']).optional(),
}).superRefine((entry, ctx) => {
  if (entry.status === 'confirmed' && !entry.confirmedBy) {
    ctx.addIssue({ code: 'custom', message: 'Confirmed current-state entries require explicit non-AI confirmation.', path: ['confirmedBy'] });
  }
  if (entry.status !== 'confirmed' && entry.confirmedBy) {
    ctx.addIssue({ code: 'custom', message: 'Only confirmed current-state entries may carry confirmedBy.', path: ['confirmedBy'] });
  }
  if (entry.supersedesEntryIds.includes(entry.id)) {
    ctx.addIssue({ code: 'custom', message: 'A current-state entry cannot supersede itself.', path: ['supersedesEntryIds'] });
  }
});

export type CurrentStateEntry = z.infer<typeof CurrentStateEntrySchema>;

export function canAiDirectlyConfirmCurrentState(): false { return false; }
export function isUsableAsCurrentState(entry: CurrentStateEntry): boolean { return entry.status === 'confirmed' && entry.confirmedBy !== undefined; }
