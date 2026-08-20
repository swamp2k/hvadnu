import { describe, expect, it } from 'vitest';
import { SYNTHETIC_CASE_SNAPSHOT } from '../../src/demo/synthetic-case-state';
import { CaseSnapshotSchema, confirmedCurrentState } from '../../src/domain/case-state';
import { InMemoryCaseRepository } from '../../src/storage/case-repository';

describe('M3 current-case foundation', () => {
  it('parses the synthetic timeline and only exposes explicitly confirmed current state', () => {
    const snapshot = CaseSnapshotSchema.parse(SYNTHETIC_CASE_SNAPSHOT);
    expect(snapshot.timeline).toHaveLength(4);
    expect(confirmedCurrentState(snapshot).map((entry) => entry.id)).toEqual(['state-current-weekend']);
  });

  it('does not treat an AI candidate as confirmed current state', () => {
    const snapshot = CaseSnapshotSchema.parse(SYNTHETIC_CASE_SNAPSHOT);
    const candidate = snapshot.currentState.find((entry) => entry.id === 'state-thursday-proposal');
    expect(candidate?.proposedBy).toBe('ai');
    expect(candidate?.status).toBe('candidate');
    expect(confirmedCurrentState(snapshot).some((entry) => entry.id === candidate?.id)).toBe(false);
  });

  it('requires explicit non-AI confirmation before a candidate becomes current state', async () => {
    const repository = new InMemoryCaseRepository([SYNTHETIC_CASE_SNAPSHOT]);
    const after = await repository.confirmCurrentState('synthetic-family-case', 'state-thursday-proposal', 'user');
    const confirmed = after.currentState.find((entry) => entry.id === 'state-thursday-proposal');
    expect(confirmed?.status).toBe('confirmed');
    expect(confirmed?.confirmedBy).toBe('user');
  });

  it('cannot re-confirm superseded state', async () => {
    const repository = new InMemoryCaseRepository([SYNTHETIC_CASE_SNAPSHOT]);
    await expect(repository.confirmCurrentState('synthetic-family-case', 'state-old-weekend', 'user')).rejects.toThrow('current_state_entry_not_candidate');
  });

  it('returns defensive copies so readers cannot silently mutate repository state', async () => {
    const repository = new InMemoryCaseRepository([SYNTHETIC_CASE_SNAPSHOT]);
    const first = await repository.getSnapshot('synthetic-family-case');
    if (!first) throw new Error('missing synthetic snapshot');
    first.timeline[0]!.title = 'mutated outside repository';
    const second = await repository.getSnapshot('synthetic-family-case');
    expect(second?.timeline[0]?.title).toBe('Tidligere samværsaftale');
  });
});
