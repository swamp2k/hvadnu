import { CaseSnapshotSchema, type CaseSnapshot } from '../domain/case-state';
import type { CurrentStateEntry } from '../domain/current-state';

export interface CaseRepository {
  getSnapshot(caseId: string): Promise<CaseSnapshot | null>;
  saveSnapshot(snapshot: CaseSnapshot): Promise<void>;
  confirmCurrentState(caseId: string, entryId: string, confirmedBy: 'user' | 'deterministic_rule'): Promise<CaseSnapshot>;
}

export class InMemoryCaseRepository implements CaseRepository {
  private readonly snapshots = new Map<string, CaseSnapshot>();

  constructor(seed: CaseSnapshot[] = []) {
    for (const snapshot of seed) this.snapshots.set(snapshot.caseId, CaseSnapshotSchema.parse(snapshot));
  }

  async getSnapshot(caseId: string): Promise<CaseSnapshot | null> {
    const snapshot = this.snapshots.get(caseId);
    return snapshot ? structuredClone(snapshot) : null;
  }

  async saveSnapshot(snapshot: CaseSnapshot): Promise<void> {
    const parsed = CaseSnapshotSchema.parse(snapshot);
    this.snapshots.set(parsed.caseId, structuredClone(parsed));
  }

  async confirmCurrentState(
    caseId: string,
    entryId: string,
    confirmedBy: 'user' | 'deterministic_rule',
  ): Promise<CaseSnapshot> {
    const snapshot = this.snapshots.get(caseId);
    if (!snapshot) throw new Error('case_not_found');

    let found = false;
    const nextEntries: CurrentStateEntry[] = snapshot.currentState.map((entry) => {
      if (entry.id !== entryId) return entry;
      found = true;
      return { ...entry, status: 'confirmed', confirmedBy };
    });

    if (!found) throw new Error('current_state_entry_not_found');

    const next = CaseSnapshotSchema.parse({
      ...snapshot,
      generatedAt: new Date().toISOString(),
      currentState: nextEntries,
    });
    this.snapshots.set(caseId, structuredClone(next));
    return structuredClone(next);
  }
}
