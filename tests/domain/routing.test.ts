import { describe, expect, it } from 'vitest';
import { buildReviewPlan } from '../../src/ai/routing';

describe('buildReviewPlan', () => {
  it('uses one Sonnet pass for a low-risk well-supported question', () => {
    expect(buildReviewPlan({
      riskLevel: 'low',
      legalUncertainty: 'low',
      evidenceSufficiency: 'sufficient',
      conflictingSources: false,
      bindingDeadlineDetected: false,
    })).toEqual({
      model: 'claude-sonnet-5',
      passes: 1,
      humanReviewRecommended: false,
      reasons: [],
    });
  });

  it('uses a second Sonnet pass when sources conflict', () => {
    const plan = buildReviewPlan({
      riskLevel: 'medium',
      legalUncertainty: 'medium',
      evidenceSufficiency: 'partial',
      conflictingSources: true,
      bindingDeadlineDetected: false,
    });

    expect(plan.model).toBe('claude-sonnet-5');
    expect(plan.passes).toBe(2);
    expect(plan.reasons).toContain('conflicting sources');
  });

  it('recommends human review for a high-risk poorly supported conclusion', () => {
    const plan = buildReviewPlan({
      riskLevel: 'high',
      legalUncertainty: 'high',
      evidenceSufficiency: 'insufficient',
      conflictingSources: false,
      bindingDeadlineDetected: false,
    });

    expect(plan.passes).toBe(2);
    expect(plan.humanReviewRecommended).toBe(true);
  });

  it('recommends human review when a binding deadline is detected', () => {
    const plan = buildReviewPlan({
      riskLevel: 'medium',
      legalUncertainty: 'medium',
      evidenceSufficiency: 'sufficient',
      conflictingSources: false,
      bindingDeadlineDetected: true,
    });

    expect(plan.humanReviewRecommended).toBe(true);
  });
});
