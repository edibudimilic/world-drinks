# World Drinks

An Astro + React PWA for exploring featured drinks on an interactive world map. The app is built static-first for SEO, with a hydrated React map island for hover, tap, search, and region filtering.

## Current Implementation

-   Responsive world map experience at `/`

-   Static country detail pages under `/countries/[slug]/` for all 177 map features in `world-atlas/countries-110m`

-   Image attribution page at `/attributions/`

-   PWA manifest, generated install icons, and offline fallback

-   Local TopoJSON map data in `public/maps/`

-   Local drink images in `public/drinks/`

-   Zod-backed data validation before production builds

## Image Sourcing

Drink images are downloaded locally only after checking that the image title/metadata matches the drink and the license allows reuse.

The first image came from Wikimedia Commons. Wikimedia then rate-limited bulk downloads, so the app uses Openverse/Flickr-hosted CC images as an alternate source where a reusable drink-specific photo can be matched and downloaded.

Current image coverage:

-   177 mapped countries/territories have drink records and local image assets.

-   147 records use downloaded local photo files with reusable license metadata.

-   30 records use generated local SVG drink artwork because no matching reusable photo could be found or every matching provider download failed.

Attribution metadata lives in `src/data/drinks.json` and is rendered on `/attributions/`.

## Commands

CommandAction`npm run dev`Start the local dev server`npm run validate:data`Validate country, source, license, image, and local file metadata`npm run build`Validate data and build the static site/PWA`npm run preview`Preview the production build locally

Useful data/image commands:

CommandAction`node scripts/generate-full-data.mjs`Regenerate all 177 country drink records from `drink-seeds.tsv` and `map-countries.jsonnode scripts/fetch-openverse-images.mjs`Try to replace generated fallback artwork with licensed Openverse photo downloads

For strict image enforcement, run:

```sh
STRICT_LOCAL_IMAGES=true npm run validate:data
```

On Windows PowerShell:

```powershell
$env:STRICT_LOCAL_IMAGES='true'; npm run validate:data; Remove-Item Env:\STRICT_LOCAL_IMAGES
```

## Data Notes

The dataset covers every feature in the bundled map. Every country record includes:

-   ISO codes and map join ID

-   Flag and region

-   A sourced featured/popular drink

-   Short drink description and rationale

-   Reusable image license metadata

-   Downloaded local image path

-   Attribution text

Do not mark a record `local-verified` unless the local image file exists and has been visually checked against the drink. Records marked `photo-metadata-verified` were matched through Openverse metadata and downloaded locally; records marked `generated-local` are local fallback artwork, not external photos.