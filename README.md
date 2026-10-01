# Waypoint

Wilf 吴凡的个人网站。包含个人介绍、比赛记录、Aevum 四入口可点击界面导览、公众号「凡有所念」的文章区、片段与笔记、近况，以及完整的中英文与浅色／深色主题切换。

Public website: [Open Waypoint](https://waypoint-wilf-wu.vercel.app).

Source: [7Wilf7/Waypoint](https://github.com/7Wilf7/Waypoint).

## Run

```sh
cd /Users/wilf/Dev/Waypoint/site
npm run dev
```

Install Node.js 24 and run:

```sh
npm install
npm run setup:admin
npm run build
npm run dev
```

Open `http://127.0.0.1:4173`. The same owner-password login is used in local development and production; no identity headers are trusted. Local content is stored under ignored `.local/content/`. Owner credentials are generated once in `.local/admin-access.txt` and `.env.local`; never commit them.

`npm run build` bundles the direct-upload client and copies only public frontend files into generated `public/`. Server source, credentials, local content, and verification artifacts stay outside that output. `npm run check` verifies languages, assets, navigation, login, publication visibility, private files, and input validation.

## Files

- `dist/index.html`: homepage content and semantic structure.
- `dist/styles.css`: theme tokens, layout, responsive styles, and interaction states.
- `dist/app.js`: theme preference, reading dialog, navigation, and pointer feedback.
- `dist/content.js`: reading content and project details.
- `dist/i18n.js`: complete authored Chinese and English interface copy.
- `dist/motion.js`: one-time chapter entrances, a damped spring for the mountain view, and visual writing previews.
- `dist/journal.js`: representative race results and published article cards.
- `dist/races.html`, `race-archive.js`, and `race-utils.js`: full race archive, category filters, recorded results, and representative selection.
- `dist/app-preview.js`, `preview-controller.js`, and `preview-screens.js`: prepared image loading, interrupted selection handling, and interactive App screen navigation.
- `dist/manage.html` and `manage.js`: owner content editing, drafts, publication, and uploads.
- `server/`: signed owner sessions, content validation, private Blob storage, and local development storage.
- `api/index.js`: Vercel Node.js function entry point.
- `vercel.json`: public frontend routing and API/media rewrites.
- `dist/assets/`: local image assets; no runtime image dependencies.

## Content and assets

The introduction and three reading pieces are first drafts prepared from Wilf's stated interests, previous writing, and Aevum's product documentation. They are editable content, not newly confirmed autobiographical statements. The race piece is an edited excerpt, not a complete race report. The Aevum link comes from its repository documentation and opens its existing login-capable application.

The mountain landscape is original AI-generated visual artwork, not a photograph of Wilf or a particular race/location. The prompt and original are retained in the local workspace `.work-assets/`. Product logos were copied from the local Aevum repository.

The App guide includes 13 main views and the shared native Settings screen in Chinese and English: 28 lossless PNG captures, covering 17 page states per language. Each image is captured at 1236×2718 pixels from the App's 412×906 phone baseline, including its original five-entry product/settings navigation. Measured button overlays provide internal navigation; no second footer is drawn by the website. The isolated Aevum source copy uses fictional training, races, ledger entries, notes, weather, six chat messages, and twelve memories grouped across the four products. English fixture titles and fixed labels are authored in the isolated capture copy; the original Aevum checkout is unchanged. The images contain no personal finances or notes and do not connect to private services. This is a browsable interface tour: editing, AI requests, imports, and cloud sync remain available in the linked application.

## Managing content

Open `/manage` and sign in with the owner password; signed-in owners also see a management link in the footer. The previous `/manage.html` address redirects permanently to `/manage`, preserving query parameters. Management remains part of this same website. Add a race or an article, fill the Chinese and English editions, attach photos or certificates, and save a draft or publish it. Both titles are required for publication; race descriptions may be empty, while articles need both text editions. Returning a published item to draft removes it from discovery. Draft files and unreferenced uploads are only accessible to the owner. The two original WeChat article texts and publication dates remain to be supplied; no article body or publication date has been fabricated.

The homepage presents one representative per populated race format, with the latest trail record as its main feature. Road formats show personal bests; Spartan shows the highest recorded tier; HYROX keeps its division. `/races` contains every published race, grouped by original year, with category filters, finish times, and expandable course details, photos, and certificates. Category selection is reflected in the URL and supports browser Back. `/races.html` and `/races/` redirect to the clean archive address.

On 2026-10-01 Wilf authorized a one-time import of all his Aevum races. The authenticated race list contained 39 records: 32 historical races with finish times (8 half marathons, 3 marathons, 11 trail races, 8 Spartan races, 1 HYROX, and 1 10K), plus 7 targets without results. Historical records are published and targets remain drafts, including a past-dated target that Aevum had not marked complete. Names, dates, results, categories, divisions, and recorded course metrics are preserved; missing distances are left empty. English race titles are translated for the website. Photos and certificates can be attached later to the existing records. Race content remains in private Blob storage; original database identifiers, source extracts, and import backups stay outside the repository and public build. This is a one-time import, not continuing synchronization.

See [Aevum integration assessment](docs/AEVUM-INTEGRATION.md) for the proposed later synchronization boundary.

The opening greeting runs once per browser-tab session. Links have contextual pointer feedback, the writing preview follows the pointer, and buttons have a damped magnetic response and a rolling fill. App images are decoded before display, active products prewarm their internal views, and only the latest product/view/language selection can commit. A loading message replaces the old image while an uncached screen is prepared. Prepared screens update immediately with a 180 ms entrance; keyboard and reduced-motion use stay immediate. The right-hand product entries always open Dashboard, Training / Activities, Ledger / Flow, and Calendar respectively. The native footer remembers each product's last normal view and provides the shared Settings page; Settings does not overwrite that remembered view. Keyboard focus follows internal page changes. Navigation follows the same About / Races / Projects / Writing order as the page and measures section positions during scrolling.

## Verification

Verify both languages and both themes at phone, tablet, and large desktop widths; language and theme persistence; article/project reading; language switching inside the reader; Escape and browser Back; keyboard focus; and reduced motion. Desktop mobile emulation does not constitute physical-device verification.

The reading scale is fluid: main body text is 18px on small screens and grows to 22px on large desktop screens with the browser's normal 16px base. The content area also expands on large displays. Motion is for this occasional personal-site visit: an opening reveal, one entrance per chapter, subtle spring-driven image depth, a navigation indicator, and writing previews on wide screens with a mouse. Reduced-motion preferences remove movement, and keyboard actions remain immediate.

The first release passed layout checks at 360–1440px in both themes, theme persistence, all four reading dialogs, direct reading links, keyboard access, browser Back, and reduced motion. Screenshots and recorded results are in `verification/`. No browser errors or warnings were recorded.

The earlier interactive preview update passed clicks through all 13 views in both languages, 12 consecutive Ultreia/Viatica switches with no stale product displayed, remembered Training subviews, keyboard and reduced-motion selection, all four navigation destinations, and 360/768/1440px layout checks in both languages and themes. Three local regressions cover out-of-order images, interrupted language/view changes, and loading failure/retry. `npm run check` and `npm run build` passed; physical-phone interaction remains unverified.

The native HD preview update passed all 34 page states, three right-hand default-page resets after visiting deeper pages, native Settings entry/return, keyboard focus retention, reduced motion, and 12 consecutive Ultreia/Viatica switches with no stale visible image. All images loaded at 1236×2718, every page had exactly five native footer entries, and Sidera had no duplicate footer. Layout checks passed at 360/768/1440px in both languages and themes without horizontal overflow. Local `/manage` loaded correctly, while `/manage.html` and `/manage/` returned 308 redirects. No homepage browser errors or warnings were recorded. Physical-phone interaction remains unverified.

The race archive update compares all 32 rendered names, dates, categories, and times against the source extract. All six filters, keyboard expansion, focus retention, browser Back, English titles/divisions, and owner save/reopen were checked. Homepage and archive layouts passed at 360/768/1440px in both languages and themes (24 combinations) without horizontal overflow. Regression checks cover representative selection across differing trail distances and Spartan tiers, preserving missing metrics and original dates, and retaining an article's original date through publication and withdrawal. Physical-phone interaction remains unverified.

## Design references

The five browser references were inspected on 2026-10-01: React Bits (`https://reactbits.dev/`), Originkit (`https://www.originkit.dev/`), Uiverse (`https://uiverse.io/`), 21st.dev (`https://21st.dev/`), and Aceternity UI (`https://ui.aceternity.com/`). Aceternity loaded successfully after its retry action.

The design adapts their restrained dark surfaces, pronounced typography, rounded navigation, image composition, subtle pointer spotlight, and immediate press feedback into a personal editorial layout. It does not reuse third-party component source or their marketing copy.

The 2026-10-01 enhancement passed owner/publication/file-validation backend tests, actual browser race and article editing, image/PDF upload, save/reopen/publish/return-to-draft, bilingual reader and browser Back, 360/412/768/1440/2560px layout checks in both languages and themes, preview switching, the first-session greeting, keyboard interaction, and reduced-motion preferences. Physical-phone validation remains pending. App preview screenshots use a local demonstration account, never production personal records.

## Vercel deployment

Connect the GitHub repository to Vercel with the Other framework preset; the build command and output directory are set in `vercel.json`. Connect a **private** Vercel Blob store in Hong Kong (hkg1). It creates `BLOB_READ_WRITE_TOKEN` automatically. Add `WAYPOINT_PASSWORD_HASH` and `WAYPOINT_SESSION_SECRET` from your generated local settings as sensitive production/preview environment variables. The website itself is public. The management API requires a signed, expiring, HttpOnly owner session and same-origin writes.

Photos and certificates use authenticated direct-to-Blob uploads, preserving the 8 MB per-file limit. The server checks actual file signatures before accepting media; public downloads are streamed through the API and are available only while referenced by a published entry. Drafts and original Blob URLs stay private. Content does not live in the GitHub repository or ephemeral Function storage.

Pushes to `main` deploy production automatically. The original Sites deployment and its Git remote are retained as a legacy snapshot; future work uses GitHub and Vercel.

The 2026-10-01 Vercel migration passed anonymous homepage access, owner login/logout, race and article draft/save/reopen/publish/withdraw, bilingual reading, a real 6 MB image and PDF certificate upload, public streamed downloads, immediate draft-media privacy, and forged identity rejection. Cursor centers were measured against moving mouse coordinates with zero offset; keyboard and reduced-motion restore the native cursor. Mobile layout was browser-emulated; physical-phone testing remains unverified. Verification records were removed after testing.

## Change the owner password

Open `/manage`, sign in, and expand **Change password**. Enter the current password and enter your new password twice (10–128 characters). The browser does not save the new password in local storage. The private Blob store keeps only a salted scrypt hash and a session version; changing the password revokes other sessions while keeping the current browser signed in. Password changes survive redeployment and use conditional writes to prevent an older request from overwriting a newer change.

The local `.local/admin-access.txt` file contains the initial password. After changing it on the website, use your own new password and save it in your password manager. Local development credentials are independent from the production Blob record.

Contextual hover circles are limited to project entry, notes, articles, and race cards. The native hand cursor remains visible; navigation, language/theme switches, preview tabs, and ordinary buttons keep their own feedback.
