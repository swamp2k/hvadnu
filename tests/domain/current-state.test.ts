import { describe, expect, it } from 'vitest';
import { CurrentStateEntrySchema, canAiDirectlyConfirmCurrentState, isUsableAsCurrentState } from '../../src/domain/current-state';

const base = {
  id: 'state-contact-1',
  topic: 'contact_schedule',
  summary: 'Every second weekend',
  authority: 'signed_party_agreement' as const,
  sourceRefs: [{ sourceId: 'doc-current' }],
  supersedesEntryIds: [] as string[],
  proposedBy: 'ai' as const,
};

describe('current-state safety', () => {
  it('never allows AI to directly confirm current state', () => { expect(canAiDirectlyConfirmCurrentState()).toBe(false); });

  it('rejects confirmed state without explicit non-AI confirmation', () => {
    expect(CurrentStateEntrySchema.safeParse({ ...base, status: 'confirmed' }).success).toBe(false);
  });

  it('rejects confirmedBy on non-confirmed state', () => {
    expect(CurrentStateEntrySchema.safeParse({ ...base, status: 'candidate', confirmedBy: 'user' }).success).toBe(false);
  });

  it('rejects self-supersession', () => {
    expect(CurrentStateEntrySchema.safeParse({ ...base, status: 'candidate', supersedesEntryIds: ['state-contact-1'] }).success).toBe(false);
  });

  it('accepts a user-confirmed current-state entry', () => {
    const entry = CurrentStateEntrySchema.parse({ ...base, status: 'confirmed', confirmedBy: 'user', sourceRefs: [{ sourceId: 'doc-current', page: 2 }], supersedesEntryIds: ['state-contact-old'] });
    expect(isUsableAsCurrentState(entry)).toBe(true);
  });
});
