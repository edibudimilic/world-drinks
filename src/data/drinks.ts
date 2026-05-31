import rawCountries from './drinks.json';
import { drinkCountryCollectionSchema, type DrinkCountry } from './schema';

export const drinkCountries = drinkCountryCollectionSchema.parse(rawCountries).sort((a, b) =>
  a.name.localeCompare(b.name)
);

export const countryByMapId = new Map(drinkCountries.map((country) => [country.mapId, country]));

export const coverageSummary = {
  verified: drinkCountries.length,
  localImages: drinkCountries.filter((country) => ['local-verified', 'photo-metadata-verified'].includes(country.image.status)).length,
  generatedImages: drinkCountries.filter((country) => country.image.status === 'generated-local').length,
  pendingImages: drinkCountries.filter((country) => country.image.status === 'download-pending').length
};

export type { DrinkCountry };