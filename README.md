# World of Echoes

An interactive map viewer for **Tome of Echo** farming locations across the four WotLK-era WoW continents (Eastern Kingdoms, Kalimdor, Outland, Northrend). Built with **Angular 18** and **Leaflet**.

> Tomes of Echo are a fictional concept made for this project — don't look them up.

See [`ANALYSIS.md`](./ANALYSIS.md) for the design decisions behind the project.

---

## Prerequisites

You need **Node.js ≥ 20** (you have Node 22 — perfect). Node ships with `npm`.

- Install from <https://nodejs.org/> (LTS).
- After installing, open a **new** terminal and verify:
  ```powershell
  node --version    # v20+ or v22+
  npm --version
  ```

> Your machine currently only has the Node bundled with Cursor (which doesn't include `npm`), so a full Node install is required before `npm install` will work.

---

## Setup

From the project root (`c:\WorldOfEchoes`):

```powershell
npm install
```

This installs Angular, Leaflet, and TypeScript.

---

## Run the dev server

```powershell
npm start
```

That opens <http://localhost:4200/>. The `/admin` page is reachable in dev mode (see below).

---

## Build for production

```powershell
npm run build
```

Output is written to `dist/world-of-echoes/browser/`. That folder is what you upload to your static host. Production build hides the `/admin` route.

---

## How to add data

### Option A — Use the admin UI (recommended)

1. `npm start`
2. Open <http://localhost:4200/admin>
3. Pick a zone tab.
4. Make sure **Click-to-place new pin** is checked.
5. Click anywhere on the map. A form opens with the (x, y) prefilled.
6. Fill it in and click **Create**.
7. Repeat for as many points as you want.
8. Click **Download tomes.json** → save the file.
9. Replace `src/assets/data/tomes.json` with the downloaded one and commit it.

> Drafts are auto-saved to `localStorage` while you work in the admin UI so you can refresh without losing work. The public map always reads the committed `tomes.json`; only `/admin` applies the draft. Use **Discard draft** to drop the local draft and reload from the on-disk JSON.

### Option B — Edit the JSON by hand

Edit `src/assets/data/tomes.json`. Schema lives in `src/app/models/tome.model.ts`.

---

## Replace the placeholder maps

Maps live in `src/assets/maps/` as WebP files. The hi-res originals stay in `maps-source/` (gitignored). To swap or update a map:

1. Drop the new high-resolution source (PNG / JPG / etc.) into `maps-source/`, keeping the same base filename (`eastern-kingdoms`, `kalimdor`, `outland`, `northrend`).
2. Run `npm run shrink-maps` — produces optimized WebPs in `src/assets/maps/`.
3. If you change file extensions, update the matching `imageUrl` in `src/assets/data/tomes.json` and in `src/app/models/tome.model.ts` (`ZONE_LIST`).

> Coordinates are stored as **percentages** of the image dimensions (0–100), so swapping an image for a higher-resolution version with the same aspect ratio leaves every pin exactly where it was. The map viewer auto-detects each image's natural width/height at runtime, so no other config needs to change for different resolutions.

---

## Project layout

```
ANALYSIS.md                          design doc (read this first)
README.md                            this file
package.json / angular.json / ...    build config
src/
  index.html / main.ts / styles.scss
  environments/                      debug flag for the admin route
  assets/
    maps/                            <-- swap the SVGs for real maps
    data/tomes.json                  data store (the only source of truth)
  app/
    app.component.*                  top-level shell
    app.config.ts / app.routes.ts    DI + router
    guards/debug.guard.ts            blocks /admin in production
    models/tome.model.ts             data types
    services/tome.service.ts         load / save / export
    components/
      map-viewer/                    Leaflet wrapper (CRS.Simple, pixel coords)
      zone-switcher/                 4 zone tabs
      tome-panel/                    side panel with full tome info
      tome-form/                     create/edit form
    pages/
      home/                          public map viewer
      admin/                         debug-only authoring page
```

---

## Deployment

We'll wire this up once you've picked a domain. Recommended path:

### Cloudflare Pages (free, recommended)
1. Push the repo to GitHub.
2. <https://dash.cloudflare.com/> → **Workers & Pages → Pages → Connect to Git**.
3. Select your repo. Build settings:
   - Build command: `npm run build`
   - Build output directory: `dist/world-of-echoes/browser`
   - Node version: `20` or `22`
4. Deploy. You'll get a `*.pages.dev` URL.

### Buy a domain
1. <https://dash.cloudflare.com/> → **Domain Registration**. At-cost pricing, free WHOIS privacy, free DNS. Around **€8–10/year** for a `.com`.
2. Once owned: Pages project → **Custom domains** → add yours. Cloudflare automatically configures DNS + TLS.

Alternative free hosts:
- **GitHub Pages**: simpler if you're already on GitHub; slower CDN.
- **Netlify** / **Vercel**: similar UX to Pages but smaller free bandwidth.

I'll write out the full step-by-step (with screenshots if you want) when you give me the green light on the domain name.

---

## Customizing colors

WoW item-quality colors are in `src/styles.scss` under `:root`:

```scss
--woe-epic: #a335ee;   /* purple */
--woe-rare: #0070dd;   /* blue */
```

Adding a new rarity later: extend the `TomeRarity` union in `models/tome.model.ts`, add the matching color var in `styles.scss`, and add an entry to `RARITY_COLORS` in `models/tome.model.ts`.

---

## License

You own this code. No license file is included; add one if you want to open-source it.
