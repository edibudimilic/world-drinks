import { z } from 'zod';

export const sourceSchema = z.object({
  label: z.string().min(2),
  url: z.string().url()
});

export const imageSchema = z.object({
  localPath: z.string().nullable(),
  status: z.enum(['local-verified', 'photo-metadata-verified', 'download-pending', 'generated-local']),
  sourceUrl: z.string().url(),
  fileTitle: z.string().min(2),
  author: z.string().min(2),
  license: z.enum(['CC0', 'Public domain', 'CC BY 1.0', 'CC BY 2.0', 'CC BY 2.5', 'CC BY 3.0', 'CC BY 4.0', 'CC BY-SA 1.0', 'CC BY-SA 2.0', 'CC BY-SA 2.5', 'CC BY-SA 3.0', 'CC BY-SA 4.0', 'Site-generated']),
  attribution: z.string().min(2)
});

export const drinkCountrySchema = z.object({
  mapId: z.string().min(2),
  iso2: z.string().length(2),
  iso3: z.string().length(3),
  isoNumeric: z.string().length(3),
  slug: z.string().min(2),
  name: z.string().min(2),
  flag: z.string().min(1),
  region: z.string().min(2),
  drink: z.string().min(2),
  drinkType: z.string().min(2),
  description: z.string().min(40),
  confidence: z.enum(['official', 'high', 'medium', 'territory']),
  rationale: z.string().min(24),
  sources: z.array(sourceSchema).min(1),
  image: imageSchema
});

export const drinkCountryCollectionSchema = z.array(drinkCountrySchema).min(1);

export type DrinkCountry = z.infer<typeof drinkCountrySchema>;