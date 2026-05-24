import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
  inject,
} from '@angular/core';
import * as L from 'leaflet';

import {
  FarmLocation,
  RARITY_COLORS,
  TomeRarity,
  ZoneConfig,
  ZoneId,
  clamp,
} from '../../models/tome.model';
import { TomeService } from '../../services/tome.service';

/** A click event on the map, in percentage coordinates (0–100). */
export interface MapClickEvent {
  x: number;
  y: number;
}

/** A "ghost" marker rendered on top of the regular layer when the
 *  admin is composing a brand-new pin that hasn't been saved yet. */
export interface DraftPin {
  x: number;
  y: number;
  rarity: TomeRarity;
}

interface LoadedImage {
  url: string;
  width: number;
  height: number;
}

interface PendingFlyTo {
  xPct: number;
  yPct: number;
  zoom: number;
  zoneId: ZoneId;
}

/**
 * Leaflet image-map viewer.
 *
 * Uses `CRS.Simple` so the map plane is pixels of the source image,
 * but all public API in/out is in **percentages** of the image
 * dimensions (0–100). This makes pin positions resolution-independent
 * — replacing a map image with one of a different size doesn't move
 * any pins, as long as the aspect ratio stays the same.
 *
 * Drag-to-edit behaviour:
 *  - When `editingLocationId` is set, that existing marker becomes
 *    draggable and emits {@link pinDragged} live as the user drags it.
 *  - When `draftPin` is set, an extra (non-persistent) marker is shown
 *    at that position and is draggable; same `pinDragged` channel.
 *  - The two are mutually exclusive; only one is active at a time.
 */
@Component({
  selector: 'woe-map-viewer',
  standalone: true,
  imports: [],
  templateUrl: './map-viewer.component.html',
  styleUrl: './map-viewer.component.scss',
})
export class MapViewerComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('mapHost', { static: true }) mapHost!: ElementRef<HTMLDivElement>;

  @Input({ required: true }) zone!: ZoneConfig;
  @Input() locations: FarmLocation[] = [];
  @Input() selectedLocationId: string | null = null;
  /** When true, clicking on empty map space emits {@link mapClicked}. */
  @Input() placementMode = false;
  /** Marker with this id becomes draggable while it's set. */
  @Input() editingLocationId: string | null = null;
  /** Optional preview pin (for new pins being authored before save). */
  @Input() draftPin: DraftPin | null = null;

  @Output() markerClicked = new EventEmitter<FarmLocation>();
  @Output() mapClicked = new EventEmitter<MapClickEvent>();
  /** Fires repeatedly while the editing / draft marker is being dragged,
   *  and one final time on drag-end. Coordinates are in percentages. */
  @Output() pinDragged = new EventEmitter<MapClickEvent>();

  private readonly ngZone = inject(NgZone);
  private readonly tomes = inject(TomeService);

  private map: L.Map | null = null;
  private imageOverlay: L.ImageOverlay | null = null;
  private markerLayer: L.LayerGroup | null = null;
  private markersById = new Map<string, L.Marker>();
  /** Reference to the special "draft pin" marker, when one exists. */
  private draftMarker: L.Marker | null = null;
  /** True while a drag is in progress so we don't fight Leaflet by
   *  re-creating the marker in response to our own emitted updates. */
  private isDragging = false;

  /** Resolved when the current zone's image has loaded. */
  private loadedImage: LoadedImage | null = null;
  /** Pending zone load — abort if the input changes again before it resolves. */
  private pendingLoadToken = 0;
  /** Queued fly-to applied once the target zone's map is ready. */
  private pendingFlyTo: PendingFlyTo | null = null;

  protected loading = true;
  protected loadError = false;

  // ──────────────────────────────────────────────────────────────────
  // Lifecycle
  // ──────────────────────────────────────────────────────────────────

  ngAfterViewInit(): void {
    this.loadAndInstallZone(this.zone);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['zone'] && !changes['zone'].firstChange) {
      this.loadAndInstallZone(this.zone);
      return;
    }
    if (!this.map || !this.loadedImage) return;

    // Order matters: re-render markers first so the editing flag is
    // up to date before we highlight / wire drag.
    if (changes['locations'] || changes['editingLocationId']) {
      this.renderMarkers();
    }
    if (changes['draftPin']) {
      this.renderDraftPin();
    }
    if (changes['selectedLocationId']) {
      this.highlightSelected();
    }
  }

  ngOnDestroy(): void {
    this.teardown();
  }

  // ──────────────────────────────────────────────────────────────────
  // Public API (called from parent via @ViewChild)
  // ──────────────────────────────────────────────────────────────────

  /** Smoothly center/zoom onto a coordinate, expressed in percentages.
   *  If the map is still loading or switching zones, the request is
   *  queued and applied once the target zone is installed. */
  flyToPercent(
    xPct: number,
    yPct: number,
    zoom?: number,
    zoneId: ZoneId = this.zone.id,
  ): void {
    this.pendingFlyTo = {
      xPct,
      yPct,
      zoom: zoom ?? 2,
      zoneId,
    };
    this.flushPendingFlyTo();
  }

  /** Reset to the default view (whole image visible). */
  resetView(): void {
    if (!this.map || !this.loadedImage) return;
    this.map.fitBounds(this.imageBounds(), { animate: false });
  }

  // ──────────────────────────────────────────────────────────────────
  // Image loading
  // ──────────────────────────────────────────────────────────────────

  private async loadAndInstallZone(zone: ZoneConfig): Promise<void> {
    const token = ++this.pendingLoadToken;
    this.loading = true;
    this.loadError = false;

    try {
      const img = await preloadImage(zone.imageUrl);
      if (token !== this.pendingLoadToken) return; // newer zone selected
      this.loadedImage = {
        url: zone.imageUrl,
        width: img.naturalWidth,
        height: img.naturalHeight,
      };
      this.installMap();
    } catch (err) {
      if (token !== this.pendingLoadToken) return;
      console.error('Failed to load map image', zone.imageUrl, err);
      this.loadError = true;
    } finally {
      if (token === this.pendingLoadToken) {
        this.loading = false;
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Leaflet wiring
  // ──────────────────────────────────────────────────────────────────

  private installMap(): void {
    if (!this.loadedImage) return;

    // Tear the old map down completely on zone change — simpler than
    // swapping the image overlay because the bounds and zoom limits
    // depend on the image's dimensions.
    this.teardown();

    this.ngZone.runOutsideAngular(() => {
      const map = L.map(this.mapHost.nativeElement, {
        crs: L.CRS.Simple,
        minZoom: -10,
        maxZoom: 5,
        zoomSnap: 0.25,
        zoomDelta: 0.5,
        wheelPxPerZoomLevel: 90,
        attributionControl: false,
        zoomControl: true,
        preferCanvas: false,
        maxBoundsViscosity: 0,
        inertia: true,
        inertiaDeceleration: 3000,
        zoomAnimation: true,
        fadeAnimation: false,
      });
      this.map = map;

      const bounds = this.imageBounds();
      this.imageOverlay = L.imageOverlay(this.loadedImage!.url, bounds).addTo(map);
      map.setMaxBounds(L.latLngBounds(bounds).pad(1.0));
      map.fitBounds(bounds, { animate: false });

      const fitZoom = map.getZoom();
      map.setMinZoom(fitZoom - 0.5);

      this.markerLayer = L.layerGroup().addTo(map);

      map.on('click', (e) => {
        if (!this.placementMode) return;
        const pct = this.latLngToPercent(e.latlng);
        this.ngZone.run(() => this.mapClicked.emit(pct));
      });

      if (typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(() => map.invalidateSize());
        ro.observe(this.mapHost.nativeElement);
      }
    });

    this.renderMarkers();
    this.renderDraftPin();
    this.highlightSelected();

    // fitBounds runs synchronously above; defer the fly so Leaflet has
    // a frame to settle before we animate to the queued pin target.
    requestAnimationFrame(() => this.flushPendingFlyTo());
  }

  private flushPendingFlyTo(): void {
    if (!this.pendingFlyTo || !this.map || !this.loadedImage) return;
    if (this.pendingFlyTo.zoneId !== this.zone.id) return;

    const { xPct, yPct, zoom } = this.pendingFlyTo;
    const latLng = this.percentToLatLng(xPct, yPct);
    const targetZoom = Math.min(zoom, this.map.getMaxZoom());
    this.map.flyTo(latLng, targetZoom, { duration: 0.6 });
    this.pendingFlyTo = null;
  }

  private teardown(): void {
    this.markersById.clear();
    this.markerLayer?.clearLayers();
    this.markerLayer = null;
    this.draftMarker = null;
    this.imageOverlay = null;
    this.map?.remove();
    this.map = null;
  }

  private renderMarkers(): void {
    if (!this.markerLayer || !this.loadedImage) return;

    // Don't redraw while the user is mid-drag — Leaflet is currently
    // moving the very marker we'd be replacing, and recreating it
    // would teleport the cursor.
    if (this.isDragging) return;

    this.markerLayer.clearLayers();
    this.markersById.clear();

    for (const loc of this.locations) {
      if (loc.zone !== this.zone.id) continue;
      const isEditing = loc.id === this.editingLocationId;
      const quality = this.tomes.getTomeQuality(loc.tomeId);
      const icon = this.buildIcon(quality, isEditing);
      const marker = L.marker(this.percentToLatLng(loc.x, loc.y), {
        icon,
        riseOnHover: true,
        title: this.tomes.getTomeName(loc.tomeId),
        draggable: isEditing,
        autoPan: isEditing,
      });

      marker.on('click', () => {
        this.ngZone.run(() => this.markerClicked.emit(loc));
      });

      if (isEditing) {
        this.attachDragHandlers(marker);
      }

      marker.addTo(this.markerLayer);
      this.markersById.set(loc.id, marker);
    }

    this.highlightSelected();
  }

  /** Render (or update) the optional draft pin used when authoring a
   *  brand-new location. Lives outside `markersById`. */
  private renderDraftPin(): void {
    if (!this.markerLayer || !this.loadedImage) return;
    if (this.isDragging) return;

    if (!this.draftPin) {
      if (this.draftMarker) {
        this.draftMarker.remove();
        this.draftMarker = null;
      }
      return;
    }

    // Reuse the existing marker if possible: avoids a flicker when
    // the parent updates draftPin in response to our drag events.
    if (this.draftMarker) {
      this.draftMarker.setLatLng(
        this.percentToLatLng(this.draftPin.x, this.draftPin.y),
      );
      this.draftMarker.setIcon(this.buildIcon(this.draftPin.rarity, true, true));
      return;
    }

    const marker = L.marker(
      this.percentToLatLng(this.draftPin.x, this.draftPin.y),
      {
        icon: this.buildIcon(this.draftPin.rarity, true, true),
        draggable: true,
        autoPan: true,
        title: 'New location (drag to position)',
      },
    );
    this.attachDragHandlers(marker);
    marker.addTo(this.markerLayer);
    this.draftMarker = marker;
  }

  private attachDragHandlers(marker: L.Marker): void {
    marker.on('dragstart', () => {
      this.isDragging = true;
    });
    marker.on('drag', () => {
      const pct = this.latLngToPercent(marker.getLatLng());
      this.ngZone.run(() => this.pinDragged.emit(pct));
    });
    marker.on('dragend', () => {
      this.isDragging = false;
      const pct = this.latLngToPercent(marker.getLatLng());
      this.ngZone.run(() => this.pinDragged.emit(pct));
    });
  }

  private highlightSelected(): void {
    for (const [id, marker] of this.markersById) {
      const el = marker.getElement();
      if (!el) continue;
      if (id === this.selectedLocationId) {
        el.classList.add('is-selected');
      } else {
        el.classList.remove('is-selected');
      }
    }
  }

  private buildIcon(
    rarity: TomeRarity,
    emphasized = false,
    isDraft = false,
  ): L.DivIcon {
    const color = RARITY_COLORS[rarity] ?? RARITY_COLORS.rare;
    const size = emphasized ? 22 : 18;
    const extraClass = isDraft ? ' is-draft' : '';
    const html = `<span class="woe-marker${emphasized ? ' is-editing' : ''}${extraClass}"
      style="display:block;width:${size}px;height:${size}px;background:${color};"></span>`;
    return L.divIcon({
      className: 'woe-marker-wrapper',
      html,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
  }

  // ──────────────────────────────────────────────────────────────────
  // Coordinate conversions
  //
  // CRS.Simple uses y-up internally, while our percentages are y-down
  // (top-left origin). We flip y at the boundary.
  // ──────────────────────────────────────────────────────────────────

  private imageBounds(): [L.LatLngTuple, L.LatLngTuple] {
    const { width, height } = this.loadedImage!;
    return [
      [0, 0],
      [height, width],
    ];
  }

  private percentToLatLng(xPct: number, yPct: number): L.LatLngExpression {
    const { width, height } = this.loadedImage!;
    const x = clamp((xPct / 100) * width, 0, width);
    const y = clamp((yPct / 100) * height, 0, height);
    return [height - y, x];
  }

  private latLngToPercent(ll: L.LatLng): MapClickEvent {
    const { width, height } = this.loadedImage!;
    const xPct = clamp((ll.lng / width) * 100, 0, 100);
    const yPct = clamp(((height - ll.lat) / height) * 100, 0, 100);
    return {
      x: Math.round(xPct * 10) / 10,
      y: Math.round(yPct * 10) / 10,
    };
  }
}

/** Preload an image and resolve with the <img> element (so callers can
 *  read `naturalWidth` / `naturalHeight`). */
function preloadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = url;
  });
}
