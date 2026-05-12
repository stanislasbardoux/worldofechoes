# World of Echoes — Project Analysis

> Detailed analysis and design decisions before writing any code.
> This document is the single source of truth for what we are building, why, and how.

---

## 1. Goal in one sentence

A small Angular web app that lets a visitor browse high-resolution maps of the four WotLK-era World of Warcraft zones (Eastern Kingdoms, Kalimdor, Outland, Northrend), click pins on those maps, and read details about fictional **Tome of Echo** items that can be farmed at those locations. A hidden debug-only page lets the maintainer (you) author the data through a form instead of editing JSON by hand.

---

## 2. Requirements (extracted from the brief)

### 2.1 Functional — public site
- One page shows **one map at a time** (chosen from the four zones).
- The map must be **pannable (drag)** and **zoomable (scroll wheel)**.
- The map must display **clickable points**.
- Clicking a point shows the Tome of Echo info either as a **tooltip or side panel** — we go with **side panel** (better for the amount of info, less obstruction of the map).

### 2.2 Tome of Echo data shape (per point)
For each point on a map:
1. **Tome name** — colored:
   - **Epic = purple** `#a335ee` (Blizzard's canonical epic color)
   - **Rare = blue** `#0070dd` (Blizzard's canonical rare color)
   - User chooses epic or blue ("rare") at creation time.
2. **Farm location name** (e.g. "Stratholme — Service Entrance").
3. **Coordinates section** with **hotlinks** to *other* places this tome can be farmed.
   - Each hotlink: `(x, y)` clickable + the place name in parentheses.
   - Clicking a hotlink should pan/zoom the map to that location and (if it's on another zone) switch zone.
4. **Mobs section** — list of mob names that drop the tome at this location.
5. **Recommended specs section** — one or more of: **Tank**, **Caster DPS**, **Melee DPS**, **Ranged DPS**.

> Important: a **Tome of Echo** is a *logical item* that can drop in multiple places. A **point** on the map represents *one farming location of one tome*. Two points that share `tomeId` are two locations for the same tome → that's how the "other farm spots" hotlinks are generated automatically.

### 2.3 Functional — debug-only creation page
- Pick one of the 4 maps.
- Click anywhere on the map → captured as `(x, y)` in the map's internal coordinate system.
- Fill a form with all the fields above.
- Save → updates local JSON.
- Edit / delete existing points.
- Export the resulting JSON so it can be committed into the repo (since we're not using a database).
- Only available when `environment.debug === true` (dev build); hidden / route-blocked in production.

### 2.4 Non-functional
- **No database.** All data lives in a single local JSON file, loaded by Angular's `HttpClient` from `assets/data/tomes.json`. In debug mode, edits live in `localStorage` until the user clicks "Export JSON" and replaces the file in `assets/data/`.
- **Angular** (latest stable, standalone components).
- High-resolution map images supported — Leaflet's `imageOverlay` + `CRS.Simple` is built exactly for this.
- Eventually: domain name + hosting + deployment (covered in §7).

---

## 3. Tech & architecture decisions

| Concern | Decision | Why |
|---|---|---|
| Framework | **Angular 18, standalone components, signals** | What you asked for; standalone is the current Angular default. |
| Map / pan / zoom | **Leaflet 1.9 with `CRS.Simple` + `imageOverlay`** | Purpose-built for tile-less image maps. Free, no API key, tiny API, scroll-wheel zoom + drag work out of the box, markers + popups are first-class. |
| Styling | Plain SCSS (no Tailwind/Material) | Keep deps small; one designer (you) won't fight a design system. WoW-themed dark UI. |
| State | Signals + a single `TomeService` | Tiny app, no need for NgRx. |
| Data file | **JSON** (not XML) | Native to JS, trivial to import/export, easier diff in git. |
| Routing | `/` home, `/admin` creation (debug-only guard) | Simple. |
| Build / deploy | Angular's static build → any static host | See §7. |
| Coordinate system | Leaflet pixel coords on the source image (top-left origin) | Stored directly in JSON; survives map image replacements as long as the image dimensions match. We'll keep `mapWidth` / `mapHeight` per zone in config to allow normalization later. |

### Why **side panel** instead of tooltip
- Lots of info per tome (name, location, mobs list, specs, list of other farm spots).
- Tooltips obscure the map and don't handle clickable hotlinks well.
- Side panel = always-visible, scrollable, easy to read, plays nice on desktop and tablet.

### Why **Leaflet** instead of OpenSeadragon / custom canvas / panzoom
- Built-in markers, popups, events (`click`, `mousemove`), layers.
- `CRS.Simple` lets us treat the image like a flat coordinate plane (pixels) — no GPS nonsense.
- The community pattern is well documented (see Leaflet's "non-geographical maps" docs).
- ~40 KB gzipped, no external API.

---

## 4. Data model

```ts
// src/app/models/tome.model.ts

export type ZoneId = 'eastern-kingdoms' | 'kalimdor' | 'outland' | 'northrend';
export type TomeRarity = 'epic' | 'rare'; // purple | blue
export type Spec = 'tank' | 'caster-dps' | 'melee-dps' | 'ranged-dps';

export interface FarmLocation {
  /** Unique id (uuid). */
  id: string;
  /** Logical tome this location belongs to. Multiple locations can share the same tomeId. */
  tomeId: string;
  /** Display name of the tome (same for every location sharing tomeId). */
  tomeName: string;
  /** epic = purple, rare = blue. Same for every location sharing tomeId. */
  rarity: TomeRarity;
  /** Zone this point is on. */
  zone: ZoneId;
  /** Pixel coordinates on the source map image (top-left origin). */
  x: number;
  y: number;
  /** Name of this specific farm spot ("Stratholme — Service Entrance"). */
  placeName: string;
  /** Mobs to kill at this spot. */
  mobs: string[];
  /** Recommended specs. */
  specs: Spec[];
  /** Optional free-form notes. */
  notes?: string;
}

export interface ZoneConfig {
  id: ZoneId;
  name: string;
  imageUrl: string;
  width: number;   // px
  height: number;  // px
}
```

### Why split `tomeId` from `id`
- The "section containing coordinates hotlinks to the different places this tome of echo can be farmed at" is implemented by querying every `FarmLocation` with the same `tomeId` and listing them, except the one being viewed.
- One source of truth for the tome's name and rarity — change it once, it updates everywhere.

### Storage layout

`src/assets/data/tomes.json`:
```json
{
  "zones": [ ZoneConfig, ... ],
  "locations": [ FarmLocation, ... ]
}
```

In debug mode, the creation page mirrors `locations` into `localStorage` under key `woe.locations.draft` and offers a "Download JSON" button that produces the file you'd commit back to `assets/data/tomes.json`.

---

## 5. UI / UX outline

### 5.1 Home (`/`)
```
+---------------------------------------------------------+
|  World of Echoes                              [Admin?]  |  <- top bar
+---------------------------------------------------------+
| [EK][Kalimdor][Outland][Northrend]                      |  <- zone tabs
|                                                         |
|  +---------------------------+   +------------------+   |
|  |                           |   |  TOME PANEL      |   |
|  |     LEAFLET MAP           |   |  (closed by      |   |
|  |     - drag to pan         |   |   default;       |   |
|  |     - wheel to zoom       |   |   opens on pin   |   |
|  |     - colored pins        |   |   click)         |   |
|  |                           |   |                  |   |
|  +---------------------------+   +------------------+   |
+---------------------------------------------------------+
```
- Pin color follows tome rarity (epic purple / rare blue).
- Side panel content (top → bottom):
  1. **Tome name** (colored).
  2. **Place name** (current spot).
  3. **Mobs** — bullet list.
  4. **Recommended specs** — chips/badges.
  5. **Other farm locations** — list of `(x, y)` hotlinks, each labeled with its place name. Clicking a hotlink may switch zone and will pan/zoom Leaflet to that point.
  6. (debug only) **Edit** / **Delete** buttons.

### 5.2 Admin (`/admin`) — debug only
- Top: zone selector (same 4 tabs).
- Map area: same Leaflet map, but with a **"click to place a new pin"** mode toggle.
- When click-to-place is active, a click on the map opens a modal form with all the tome fields prefilled with `x, y, zone`.
- Sidebar: list of existing locations for the current zone, each with edit/delete.
- Bottom: **Export JSON** button → downloads `tomes.json`.

---

## 6. Project structure

```
WorldOfEchoes/
├── ANALYSIS.md                       <- this file
├── README.md
├── package.json
├── angular.json
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.spec.json
└── src/
    ├── index.html
    ├── main.ts
    ├── styles.scss
    ├── environments/
    │   ├── environment.ts                (debug: false)
    │   └── environment.development.ts    (debug: true)
    ├── assets/
    │   ├── maps/                          <- placeholder SVGs you'll replace
    │   │   ├── eastern-kingdoms.svg
    │   │   ├── kalimdor.svg
    │   │   ├── outland.svg
    │   │   └── northrend.svg
    │   └── data/
    │       └── tomes.json
    └── app/
        ├── app.component.{ts,html,scss}
        ├── app.routes.ts
        ├── app.config.ts
        ├── models/
        │   └── tome.model.ts
        ├── services/
        │   └── tome.service.ts
        ├── guards/
        │   └── debug.guard.ts
        ├── pages/
        │   ├── home/                     <- public map viewer
        │   └── admin/                    <- debug-only authoring page
        └── components/
            ├── map-viewer/                <- Leaflet wrapper
            ├── zone-switcher/             <- 4-tab selector
            ├── tome-panel/                <- side panel
            └── tome-form/                 <- creation/edit form
```

---

## 7. Hosting & deployment plan (covered later)

We'll pick from these options when the site is ready:

| Option | Cost / mo | Pros | Cons |
|---|---|---|---|
| **Cloudflare Pages** | Free | Best CDN, free SSL, free custom domain, generous bandwidth, GitHub auto-deploy | None for a static SPA |
| **GitHub Pages** | Free | Simple, free SSL, free | Slower CDN, awkward custom-domain workflow |
| **Netlify** | Free tier | Great DX, easy forms/redirects | Bandwidth caps on free tier |
| **Vercel** | Free tier | Great DX | Same caveat |
| **Static on a VPS** (Hetzner / OVH) | ~€4 | Full control | You maintain TLS, nginx |

**Recommendation:** Cloudflare Pages + a domain bought at **Cloudflare Registrar** (at-cost pricing, no markup, free WHOIS privacy). Roughly €8–10/year for a `.com`. The build command is `npm run build`, the output dir is `dist/world-of-echoes/browser`.

I'll write out the step-by-step (buy domain → connect to Cloudflare → push repo to GitHub → enable Pages → set CNAME) once the site is up and you've picked the name.

---

## 8. Open questions for you (not blocking; defaults assumed)

1. **Pin shape:** colored circle markers (default) — OK?
2. **Cluster** when many pins close together: not implementing v1 (your call later).
3. **Mobile** support: nice-to-have v2; v1 targets desktop.
4. **Search** for a tome by name across all zones: nice-to-have v2.
5. **Coordinate display format:** I'll use Leaflet's pixel coords (e.g. `(2143, 871)`). If you prefer WoW's `0–100 / 0–100` format I can normalize at render time — easy switch later.

I'll proceed with the defaults above and you can course-correct anytime.

---

## 9. Coding conventions

- **Standalone components** (no NgModules).
- **Signals** for component state, `inject()` for DI.
- SCSS with BEM-ish class names (`.tome-panel__title`).
- Color tokens centralized in `styles.scss`:
  - `--woe-epic: #a335ee;`
  - `--woe-rare: #0070dd;`
  - `--woe-bg: #0e0f12;`
  - `--woe-panel: #1a1d23;`
  - `--woe-text: #e6e6e6;`

---

## 10. Definition of done (v1)

- [ ] Project builds (`npm run build`) and serves (`npm start`).
- [ ] All 4 maps can be selected and panned/zoomed.
- [ ] Pins appear, colored by rarity.
- [ ] Clicking a pin opens the side panel with all required info.
- [ ] Hotlinks to other farm spots work and switch zone when needed.
- [ ] `/admin` is reachable only in dev build, allows create/edit/delete + JSON export.
- [ ] Placeholder map SVGs are in place and obvious enough to swap.
- [ ] README documents: how to run, how to add data, how to deploy.
