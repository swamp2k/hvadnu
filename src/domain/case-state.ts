import { z } from 'zod';
import { CurrentStateEntrySchema } from './current-state';

export const CaseTimelineKindSchema = z.enum([
  'document',
  'message',
  'agreement',
  'decision',
  'proposal',
  'claim',
  'deadline',
]);

export const CaseTimelineEventSchema = z.object({
  id: z.string().min(1),
  occurredAt: z.string().datetime().nullable(),
  kind: CaseTimelineKindSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  sourceIds: z.array(z.string().min(1)).min(1),
  topic: z.string().min(1),
  disputed: z.boolean().default(false),
});

export const CaseSnapshotSchema = z.object({
  caseId: z.string().min(1),
  generatedAt: z.string().datetime(),
  timeline: z.array(CaseTimelineEventSchema),
  currentState: z.array(CurrentStateEntrySchema),
});

export type CaseTimelineEvent = z.infer<typeof CaseTimelineEventSchema>;
export type CaseSnapshot = z.infer<typeof CaseSnapshotSchema>;

export function visibleCurrentState(snapshot: CaseSnapshot) {
  return snapshot.currentState.filter((entry) => entry.status !== 'rejected');
}

export function confirmedCurrentState(snapshot: CaseSnapshot) {
  return snapshot.currentState.filter(
    (entry) => entry.status === 'confirmed' && entry.confirmedBy !== undefined,
  );
}
