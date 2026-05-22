import { Component, ViewChild, computed, inject, signal } from '@angular/core';

import {
  DraftPin,
  MapViewerComponent,
  MapClickEvent,
} from '../../components/map-viewer/map-viewer.component';
import { ZoneSwitcherComponent } from '../../components/zone-switcher/zone-switcher.component';
import {
  TomeFormComponent,
  TomeFormSaveEvent,
} from '../../components/tome-form/tome-form.component';
import { TomeService } from '../../services/tome.service';
import { FarmLocation, TomeRarity, ZoneId } from '../../models/tome.model';

/**
 * Editor session state. While `open` is true the right side panel
 * shows the form. `initial` is non-null when editing an existing pin,
 * null when authoring a brand-new one.
 */
interface EditorState {
  open: boolean;
  /** Bumped whenever a fresh session begins; tells the form to fully
   *  reset rather than just sync coordinates. */
  sessionKey: number;
  initial: FarmLocation | null;
  x: number;
  y: number;
  tomeQuality: TomeRarity;
}

const CLOSED_EDITOR: EditorState = {
  open: false,
  sessionKey: 0,
  initial: null,
  x: 0,
  y: 0,
  tomeQuality: 'epic',
};

@Component({
  selector: 'woe-admin',
  standalone: true,
  imports: [MapViewerComponent, ZoneSwitcherComponent, TomeFormComponent],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.scss',
})
export class AdminComponent {
  protected readonly tomes = inject(TomeService);

  @ViewChild(MapViewerComponent) private mapViewer?: MapViewerComponent;

  protected readonly selectedZoneId = signal<ZoneId>('northrend');
  protected readonly placementMode = signal(true);
  protected readonly selectedLocationId = signal<string | null>(null);
  protected readonly editor = signal<EditorState>(CLOSED_EDITOR);

  protected readonly currentZone = computed(() => {
    const id = this.selectedZoneId();
    return this.tomes.zones().find((z) => z.id === id) ?? this.tomes.zones()[0];
  });

  protected readonly visibleLocations = computed(() =>
    this.tomes.locations().filter((l) => l.zone === this.selectedZoneId()),
  );

  /** Id of the existing pin currently being edited (for draggable
   *  highlighting on the map). Null when authoring a new pin. */
  protected readonly editingLocationId = computed(() => {
    const ed = this.editor();
    return ed.open && ed.initial ? ed.initial.id : null;
  });

  /** Draft pin shown on the map while authoring a new (unsaved) pin. */
  protected readonly draftPin = computed<DraftPin | null>(() => {
    const ed = this.editor();
    if (!ed.open || ed.initial) return null;
    return { x: ed.x, y: ed.y, rarity: ed.tomeQuality };
  });

  constructor() {
    this.tomes.load();
  }

  protected tomeNameFor(loc: FarmLocation): string {
    return this.tomes.getTomeName(loc.tomeId);
  }

  protected tomeQualityFor(loc: FarmLocation): TomeRarity {
    return this.tomes.getTomeQuality(loc.tomeId);
  }

  // ──────────────────────────────────────────────────────────────────
  // UI handlers
  // ──────────────────────────────────────────────────────────────────

  protected onZoneChanged(zoneId: ZoneId): void {
    this.selectedZoneId.set(zoneId);
    this.selectedLocationId.set(null);
    // Switching zones cancels an in-progress edit on the previous map.
    this.closeEditor();
  }

  /** Click on empty map space. */
  protected onMapClicked(ev: MapClickEvent): void {
    if (!this.placementMode()) return;
    const current = this.editor();
    // If a *new-pin* editor is already open, move the draft instead of
    // discarding the form fields the user may have already typed.
    if (current.open && !current.initial) {
      this.editor.set({ ...current, x: ev.x, y: ev.y });
      return;
    }
    this.openEditorForNew(ev.x, ev.y);
  }

  /** Click on an existing marker — opens that pin in the editor. */
  protected onMarkerClicked(loc: FarmLocation): void {
    this.openEditorForExisting(loc);
  }

  /** Pin drag (either the editing marker or the draft pin). */
  protected onPinDragged(ev: MapClickEvent): void {
    const current = this.editor();
    if (!current.open) return;
    this.editor.set({ ...current, x: ev.x, y: ev.y });
  }

  /** X / Y inputs typed into in the form. */
  protected onFormCoordsChanged(ev: { x: number; y: number }): void {
    const current = this.editor();
    if (!current.open) return;
    this.editor.set({ ...current, x: ev.x, y: ev.y });
  }

  protected onTomeQualityChanged(quality: TomeRarity): void {
    const current = this.editor();
    if (!current.open) return;
    this.editor.set({ ...current, tomeQuality: quality });
  }

  protected onFormSaved(ev: TomeFormSaveEvent): void {
    this.tomes.upsertTome(ev.tome);
    this.tomes.upsert(ev.location);
    this.selectedLocationId.set(ev.location.id);
    if (ev.location.zone !== this.selectedZoneId()) {
      this.selectedZoneId.set(ev.location.zone);
    }
    this.closeEditor();
  }

  protected onFormCancelled(): void {
    this.closeEditor();
  }

  protected editLocation(loc: FarmLocation): void {
    this.openEditorForExisting(loc);
  }

  protected deleteLocation(loc: FarmLocation): void {
    const ok = confirm(
      `Delete "${loc.placeName}" for ${this.tomeNameFor(loc)}?`,
    );
    if (!ok) return;
    this.tomes.remove(loc.id);
    if (this.selectedLocationId() === loc.id) {
      this.selectedLocationId.set(null);
    }
    if (this.editor().initial?.id === loc.id) {
      this.closeEditor();
    }
  }

  protected exportJson(): void {
    this.tomes.downloadJson();
  }

  protected async discardDraft(): Promise<void> {
    const ok = confirm(
      'Discard the local draft and reload from assets/data/tomes.json? Any unsaved changes will be lost.',
    );
    if (!ok) return;
    this.closeEditor();
    await this.tomes.discardDraft();
  }

  protected togglePlacement(): void {
    this.placementMode.update((v) => !v);
  }

  // ──────────────────────────────────────────────────────────────────
  // Editor state helpers
  // ──────────────────────────────────────────────────────────────────

  private openEditorForNew(x: number, y: number): void {
    this.editor.set({
      open: true,
      sessionKey: this.editor().sessionKey + 1,
      initial: null,
      x,
      y,
      tomeQuality: 'epic',
    });
    this.selectedLocationId.set(null);
  }

  private openEditorForExisting(loc: FarmLocation): void {
    if (loc.zone !== this.selectedZoneId()) {
      this.selectedZoneId.set(loc.zone);
    }
    this.editor.set({
      open: true,
      sessionKey: this.editor().sessionKey + 1,
      initial: loc,
      x: loc.x,
      y: loc.y,
      tomeQuality: this.tomes.getTomeQuality(loc.tomeId),
    });
    this.selectedLocationId.set(loc.id);
  }

  private closeEditor(): void {
    this.editor.set(CLOSED_EDITOR);
  }
}
