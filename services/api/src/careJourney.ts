import { z } from "zod";

export const careStage = z.enum(["CONSULTATION", "ASSESSMENT", "TREATMENT_PLANNING", "COORDINATION", "TREATMENT", "RECOVERY", "FOLLOW_UP"]);
export type CareStage = z.infer<typeof careStage>;

export const careJourney = z.object({
  patientId: z.string().min(1),
  stage: careStage,
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().max(2000),
  nextAction: z.string().trim().max(500),
  estimatedRangeUsd: z.object({ low: z.number().nonnegative(), high: z.number().nonnegative() }).refine((v) => v.high >= v.low).nullable(),
  updatedAt: z.string().datetime(),
});
export type CareJourney = z.infer<typeof careJourney>;

export function buildJourneyStage(input: Omit<CareJourney, "updatedAt">): CareJourney {
  return careJourney.parse({ ...input, updatedAt: new Date().toISOString() });
}
