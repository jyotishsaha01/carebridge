import { z } from "zod";

export const careMetric = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/),
  consultations: z.number().int().nonnegative(),
  completedConsultations: z.number().int().nonnegative(),
  followUpsDue: z.number().int().nonnegative(),
  activeDoctors: z.number().int().nonnegative(),
});
export type CareMetric = z.infer<typeof careMetric>;

export function completionRate(metric: Pick<CareMetric, "consultations" | "completedConsultations">) {
  if (metric.consultations === 0) return 0;
  return Math.round((metric.completedConsultations / metric.consultations) * 10000) / 100;
}
