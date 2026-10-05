# Waypoint

- Personal website for Wilf 吴凡. Maintain complete authored Chinese and English editions, including reading content, accessible labels, and metadata. Preserve both language and theme preferences.
- Editable frontend files remain in `dist/`; the Vercel API and storage/auth implementation are in `api/` and `server/`. `npm run build` generates `public/` and `dist/upload-client.js`; do not edit those generated files.
- Run `npm run dev` and `npm run check` from this checkout. Preserve both complete theme palettes and the stored preference.
- Main visitor paths are profile, project discovery, and reading. Verify requested behavior in the browser, including narrow mobile widths and keyboard use.
- Biography and race writing are sourced drafts: do not invent results, metrics, job titles, contact details, or real-life photographs. Keep artwork provenance in README.
- Aevum is reference material. Keep the personal site independent of its private data and preserve the Aevum checkout.
- Races, articles and uploaded media use a private Vercel Blob store. Only the authenticated owner may manage them. Drafts and unattached files must stay private. Browser storage is only for theme, language, and visit preferences. Never trust client-supplied identity headers.
- Keep credentials, `.env.local`, `.vercel/`, local data and verification artifacts out of Git and public build output. Preserve the 8 MB upload limit using authenticated direct uploads and streaming media responses. Verify authorization and publication visibility with `npm run check`.
- Optional public snapshots follow `docs/PUBLIC-CONTENT.md`: private Blob remains the management authority; published text and sanitized associated raster files are generated only by explicit builds and never committed. Static updates/withdrawals require rebuilding and deploying plus handling old deployment URLs. Do not promote an old static snapshot as rollback. Production export requires explicit approval and a paused-writer deployment window; Preview must not access real Blob data.
