import { describe, expect, it } from 'vitest';
import {
  CurrentStateEntrySchema,
  canAiDirectlyConfirmCurrentState,
  isUsableAsCurrentState,
} from '../../src/domain/current-state';

describe('current-state safety', () => {
  it('never allows AI to directly confirm current state', () => {
    expect(canAiDirectlyConfirmCurrentState()).toBe(false);
  });

  it('rejects confirmed state without explicit non-AI confirmation', () => {
    const result = CurrentStateEntrySchema.safeParse({
      id: 'state-contact-1',
      topic: 'contact_schedule',
      summary: 'Every second weekend',
      authority: 'signed_party_agreement',
      status: 'confirmed',
      sourceRefs: [{ sourceId: 'doc-current' }],
      supersedesEntryIds: [],
      proposedBy: 'ai',
    });

    expect(result.success).toBe(false);
  });

  it('accepts a user-confirmed current-state entry', () => {
    const entry = CurrentStateEntrySchema.parse({
      id: 'state-contact-1',
      topic: 'contact_schedule',
      summary: 'Every second weekend',
      authority: 'signed_party_agreement',
      status: 'confirmed',
      sourceRefs: [{ sourceId: 'doc-current', page: 2 }],
      supersedesEntryIds: ['state-contact-old'],
      proposedBy: 'ai',
      confirmedBy: 'user',
    });

    expect(isUsableAsCurrentState(entry)).toBe(true);
  });
});
