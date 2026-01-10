import { z } from "zod";

export const EvidenceAtomZ = z.object({
  atomId: z.string().min(5),
  type: z.enum([
    "sales_volume",
    "complaint_record",
    "incident_record",
    "fsca_record",
    "pmcf_result",
    "literature_result",
  ]),
  version: z.number().int().min(1).default(1),
  contentHash: z.string().min(16),

  data: z.union([z.string(), z.number(), z.boolean(), z.null(), z.object({}).passthrough(), z.array(z.any())]),

  normalizedData: z.object({}).passthrough().optional(),

  provenance: z.object({
    uploadId: z.number().int(),
    sourceFile: z.string(),
    extractedAt: z.string(),
    deviceRef: z.object({
      deviceCode: z.string(),
    }),
    psurPeriod: z.object({
      periodStart: z.string(),
      periodEnd: z.string(),
    }),
    filters: z.object({}).passthrough().optional(),
  }),
});

export type EvidenceAtom = z.infer<typeof EvidenceAtomZ>;
