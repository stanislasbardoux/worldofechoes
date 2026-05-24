import {
  AfterViewInit,
  Component,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';

import {
  MapViewerComponent,
} from '../../components/map-viewer/map-viewer.component';
import {
  TomePanelComponent,
  JumpToLocationEvent,
} from '../../components/tome-panel/tome-panel.component';
import { ZoneSwitcherComponent } from '../../components/zone-switcher/zone-switcher.component';
import { TomeService } from '../../services/tome.service';
import {
  FarmLocation,
  ZoneId,
} from '../../models/tome.model';

@Component({
  selector: 'woe-home',
  standalone: true,
  imports: [MapViewerComponent, TomePanelComponent, ZoneSwitcherComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent implements AfterViewInit {
  protected readonly tomes = inject(TomeService);

  @ViewChild(MapViewerComponent) private mapViewer?: MapViewerComponent;

  /** Focus target waiting for the map viewer @ViewChild to mount. */
  private pendingFocus: FarmLocation | null = null;

  protected readonly selectedZoneId = signal<ZoneId>('northrend');
  protected readonly selectedLocationId = signal<string | null>(null);

  protected readonly currentZone = computed(() => {
    const id = this.selectedZoneId();
    return this.tomes.zones().find((z) => z.id === id) ?? this.tomes.zones()[0];
  });

  protected readonly visibleLocations = computed(() =>
    this.tomes.locations().filter((l) => l.zone === this.selectedZoneId()),
  );

  protected readonly selectedLocation = computed(() => {
    const id = this.selectedLocationId();
    if (!id) return null;
    return this.tomes.locations().find((l) => l.id === id) ?? null;
  });

  protected readonly siblings = computed(() => {
    const sel = this.selectedLocation();
    if (!sel) return [];
    return this.tomes.getSiblingsByTome(sel.tomeId, sel.id);
  });

  protected readonly zoneNameLookup = computed(() => {
    const out: Record<ZoneId, string> = {
      'eastern-kingdoms': 'Eastern Kingdoms',
      'kalimdor': 'Kalimdor',
      'outland': 'Outland',
      'northrend': 'Northrend',
    };
    for (const z of this.tomes.zones()) {
      out[z.id] = z.name;
    }
    return out;
  });

  constructor() {
    this.tomes.load();

    // Watch for "focus this location" requests coming from the search
    // box (which lives in the header and can fire across navigation).
    // `allowSignalWrites` is required because `consumeFocusRequest()`
    // writes back to the same signal we just read.
    effect(
      () => {
        const id = this.tomes.focusRequest();
        if (!id) return;
        const target = this.tomes.getLocation(id);
        this.tomes.consumeFocusRequest();
        if (!target) return;
        this.focusLocation(target);
      },
      { allowSignalWrites: true },
    );
  }

  ngAfterViewInit(): void {
    this.applyPendingFocus();
  }

  // ──────────────────────────────────────────────────────────────────
  // UI handlers
  // ──────────────────────────────────────────────────────────────────

  protected onZoneChanged(zoneId: ZoneId): void {
    this.selectedZoneId.set(zoneId);
    this.selectedLocationId.set(null);
  }

  protected onMarkerClicked(loc: FarmLocation): void {
    this.selectedLocationId.set(loc.id);
  }

  protected onPanelClosed(): void {
    this.selectedLocationId.set(null);
  }

  protected onJumpTo(ev: JumpToLocationEvent): void {
    const target = this.tomes.getLocation(ev.locationId);
    if (!target) return;
    this.focusLocation(target);
  }

  /**
   * Switch to the location's zone if needed, select it, and pan/zoom
   * Leaflet to the right percentage coordinates. The map viewer queues
   * the fly-to until the target zone image has finished loading.
   */
  private focusLocation(target: FarmLocation): void {
    if (target.zone !== this.selectedZoneId()) {
      this.selectedZoneId.set(target.zone);
    }
    this.selectedLocationId.set(target.id);
    this.pendingFocus = target;
    this.applyPendingFocus();
  }

  private applyPendingFocus(): void {
    if (!this.pendingFocus || !this.mapViewer) return;
    const target = this.pendingFocus;
    this.pendingFocus = null;
    this.mapViewer.flyToPercent(target.x, target.y, 2, target.zone);
  }
}
