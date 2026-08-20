import { z } from 'zod';

export const RiskLevelSchema = z.enum(['low', 'medium', 'high', 'critical']);
export const LegalUncertaintySchema = z.enum(['low', 'medium', 'high']);
export const EvidenceSufficiencySchema = z.enum(['sufficient', 'partial', 'insufficient']);

export const ReviewContextSchema = z.object({
  riskLevel: RiskLevelSchema,
  legalUncertainty: LegalUncertaintySchema,
  evidenceSufficiency: EvidenceSufficiencySchema,
  conflictingSources: z.boolean(),
  bindingDeadlineDetected: z.boolean(),
});

export type ReviewContext = z.infer<typeof ReviewContextSchema>;

export interface ReviewPlan {
  model: 'claude-sonnet-5';
  passes: 1 | 2;
  humanReviewRecommended: boolean;
  reasons: string[];
}

export function buildReviewPlan(context: ReviewContext): ReviewPlan {
  const reasons: string[] = [];

  const secondPass =
    context.riskLevel === 'high' ||
    context.riskLevel === 'critical' ||
    context.legalUncertainty === 'high' ||
    context.evidenceSufficiency === 'insufficient' ||
    context.conflictingSources ||
    context.bindingDeadlineDetected;

  if (context.riskLevel === 'high' || context.riskLevel === 'critical') {
    reasons.push('high-risk outcome');
  }
  if (context.legalUncertainty === 'high') {
    reasons.push('high legal uncertainty');
  }
  if (context.evidenceSufficiency === 'insufficient') {
    reasons.push('insufficient evidence');
  }
  if (context.conflictingSources) {
    reasons.push('conflicting sources');
  }
  if (context.bindingDeadlineDetected) {
    reasons.push('binding or potentially binding deadline');
  }

  const humanReviewRecommended =
    context.riskLevel === 'critical' ||
    context.bindingDeadlineDetected ||
    (context.riskLevel === 'high' &&
      (context.legalUncertainty === 'high' ||
        context.evidenceSufficiency !== 'sufficient' ||
        context.conflictingSources));

  return {
    model: 'claude-sonnet-5',
    passes: secondPass ? 2 : 1,
    humanReviewRecommended,
    reasons,
  };
}
