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

  // A second model pass cannot manufacture missing evidence. Review is reserved for
  // cases where the consequence or source conflict makes a reasoning error costly.
  const highRiskWithInterpretationRisk =
    context.riskLevel === 'high' &&
    (context.legalUncertainty === 'high' || context.evidenceSufficiency === 'insufficient');

  const secondPass =
    context.riskLevel === 'critical' ||
    context.bindingDeadlineDetected ||
    context.conflictingSources ||
    highRiskWithInterpretationRisk;

  if (context.riskLevel === 'critical') reasons.push('critical-risk outcome');
  if (highRiskWithInterpretationRisk) reasons.push('high-risk outcome with material uncertainty');
  if (context.conflictingSources) reasons.push('conflicting sources');
  if (context.bindingDeadlineDetected) reasons.push('binding or potentially binding deadline');

  const humanReviewRecommended =
    context.riskLevel === 'critical' ||
    context.bindingDeadlineDetected ||
    highRiskWithInterpretationRisk ||
    (context.riskLevel === 'high' && context.conflictingSources);

  return {
    model: 'claude-sonnet-5',
    passes: secondPass ? 2 : 1,
    humanReviewRecommended,
    reasons,
  };
}
