import { Injectable, computed, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import {
  FarmLocation,
  TomeDataFile,
  ZONE_LIST,
  ZoneConfig,
  ZoneId,
} from '../models/tome.model';

/**
 * Loads tome data from /assets/data/tomes.json on startup, then keeps an
 * in-memory copy as a signal. In debug mode, mutations are mirrored into
 * localStorage so they survive page reloads while authoring, and can be
 * exported back to a JSON file the user commits to the repo.
 */
@Injectable({ providedIn: 'root' })
export class TomeService {
  private readonly http = inject(HttpClient);

  private static readonly DATA_URL = 'assets/data/tomes.json';
  // Bump the suffix to invalidate older drafts whenever the bundled
  // tomes.json schema or content changes meaningfully. Existing drafts
  // in older keys are simply abandoned by being unread; the browser
  // will garbage-collect them when storage pressure hits.
  private static readonly LS_KEY = 'woe.locations.draft.v2';

  private readonly _zones = signal<ZoneConfig[]>(ZONE_LIST);
  private readonly _locations = signal<FarmLocation[]>([]);
  private readonly _loaded = signal(false);
  /** Cross-component channel: the search box writes here, the home
   *  page watches it and pans/zooms to the requested location. */
  private readonly _focusRequest = signal<string | null>(null);

  readonly zones = this._zones.asReadonly();
  readonly locations = this._locations.asReadonly();
  readonly loaded = this._loaded.asReadonly();
  readonly focusRequest = this._focusRequest.asReadonly();

  /** Locations indexed by zone — recomputed when locations change. */
  readonly locationsByZone = computed(() => {
    const map = new Map<ZoneId, FarmLocation[]>();
    for (const zone of this._zones()) {
      map.set(zone.id, []);
    }
    for (const loc of this._locations()) {
      const list = map.get(loc.zone);
      if (list) {
        list.push(loc);
      }
    }
    return map;
  });

  /**
   * Initial load: try localStorage draft first (debug authoring), fall back
   * to the bundled JSON file.
   */
  async load(): Promise<void> {
    if (this._loaded()) return;

    const draft = this.readDraft();
    if (draft) {
      // Drafts snapshot `zones` into localStorage. After we change map
      // URLs (e.g. .png → .webp) or paths, an old draft still wins load
      // order and would 404 every image. Zone metadata (paths) always
      // comes from the built-in ZONE_LIST; we only keep authored pins
      // from the draft.
      this._zones.set(ZONE_LIST);
      this._locations.set(draft.locations ?? []);
      this.persistDraft();
      this._loaded.set(true);
      return;
    }

    try {
      const data = await firstValueFrom(
        this.http.get<TomeDataFile>(TomeService.DATA_URL),
      );
      this._zones.set(data.zones?.length ? data.zones : ZONE_LIST);
      this._locations.set(data.locations ?? []);
    } catch (err) {
      console.warn('Failed to load tomes.json, starting empty.', err);
      this._zones.set(ZONE_LIST);
      this._locations.set([]);
    } finally {
      this._loaded.set(true);
    }
  }

  getZone(id: ZoneId): ZoneConfig | undefined {
    return this._zones().find((z) => z.id === id);
  }

  getLocation(id: string): FarmLocation | undefined {
    return this._locations().find((l) => l.id === id);
  }

  /** All locations that share a tomeId (used for cross-link hotlinks). */
  getSiblingsByTome(tomeId: string, excludeId?: string): FarmLocation[] {
    return this._locations().filter(
      (l) => l.tomeId === tomeId && l.id !== excludeId,
    );
  }

  // ──────────────────────────────────────────────────────────────────
  // Focus-request channel (search → home page)
  // ──────────────────────────────────────────────────────────────────

  /** Ask the home page to navigate to (and select) this location. */
  requestFocusLocation(locationId: string): void {
    // Force a new value even if it equals the previous one, so the
    // home page's effect always fires.
    this._focusRequest.set(null);
    queueMicrotask(() => this._focusRequest.set(locationId));
  }

  /** Called by the consumer once it has acted on a focus request. */
  consumeFocusRequest(): void {
    this._focusRequest.set(null);
  }

  // ──────────────────────────────────────────────────────────────────
  // Mutations (debug authoring)
  // ──────────────────────────────────────────────────────────────────

  upsert(location: FarmLocation): void {
    const list = [...this._locations()];
    const idx = list.findIndex((l) => l.id === location.id);
    if (idx >= 0) {
      list[idx] = location;
    } else {
      list.push(location);
    }
    this._locations.set(list);
    this.persistDraft();
  }

  remove(id: string): void {
    this._locations.set(this._locations().filter((l) => l.id !== id));
    this.persistDraft();
  }

  /** Drop any in-progress draft from localStorage and reload from disk. */
  async discardDraft(): Promise<void> {
    try {
      localStorage.removeItem(TomeService.LS_KEY);
    } catch {
      // localStorage may be unavailable (SSR, private mode)
    }
    this._loaded.set(false);
    await this.load();
  }

  /** Serialize current in-memory state to a JSON string the user can save. */
  exportJson(): string {
    const payload: TomeDataFile = {
      zones: this._zones(),
      locations: this._locations(),
    };
    return JSON.stringify(payload, null, 2);
  }

  /** Trigger a browser download of the current state as tomes.json. */
  downloadJson(filename = 'tomes.json'): void {
    const blob = new Blob([this.exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ──────────────────────────────────────────────────────────────────
  // localStorage draft helpers
  // ──────────────────────────────────────────────────────────────────

  private persistDraft(): void {
    try {
      const payload: TomeDataFile = {
        zones: this._zones(),
        locations: this._locations(),
      };
      localStorage.setItem(TomeService.LS_KEY, JSON.stringify(payload));
    } catch {
      // ignore
    }
  }

  private readDraft(): TomeDataFile | null {
    try {
      const raw = localStorage.getItem(TomeService.LS_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as TomeDataFile;
      if (!parsed.locations) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  /** Generate a v4-ish unique id without pulling a uuid dependency. */
  static newId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}
