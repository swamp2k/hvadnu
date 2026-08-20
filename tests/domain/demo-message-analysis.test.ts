import { describe, expect, it } from 'vitest';
import { analyzeDemoMessage } from '../../src/demo/analyze-demo-message';
import { DEMO_MESSAGES } from '../../src/demo/synthetic-case';

describe('M1 synthetic message assistant', () => {
  it('does not promote a lawyer proposal or party claim into a current agreement', () => {
    const result = analyzeDemoMessage(DEMO_MESSAGES.changedPickup);

    expect(result.legalAssessment.level).toBe('attention');
    expect(result.legalAssessment.title).toContain('ikke dokumenteret');
    expect(result.legalAssessment.sourceIds).toContain('doc-2025-current-contact');
    expect(result.legalAssessment.sourceIds).toContain('doc-2026-lawyer-proposal');
    expect(result.reviewPlan.passes).toBe(2);
    expect(result.reviewPlan.humanReviewRecommended).toBe(true);
    expect(result.suggestedReply).toContain('fredag kl. 17');
  });

  it('pushes back on the app user when scout camp is asserted as an automatic right to cancel', () => {
    const result = analyzeDemoMessage(DEMO_MESSAGES.scoutCamp);

    expect(result.legalAssessment.level).toBe('not_supported');
    expect(result.legalAssessment.explanation).toContain('ingen aktuel juridisk kilde');
    expect(result.suggestedReply).toContain('Kan vi aftale');
    expect(result.reviewPlan.passes).toBe(2);
  });

  it('abstains on unknown messages instead of inventing case context', () => {
    const result = analyzeDemoMessage('Du skylder mig svar på det vi talte om i går.');

    expect(result.caseContext).toEqual([]);
    expect(result.citations).toEqual([]);
    expect(result.legalAssessment.level).toBe('uncertain');
    expect(result.uncertainty.level).toBe('high');
    expect(result.legalAssessment.explanation).toContain('må ikke improvisere');
  });
});
