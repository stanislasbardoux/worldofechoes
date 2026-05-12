import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ALL_SPECS,
  FarmLocation,
  SPEC_LABELS,
  Spec,
  TomeRarity,
  ZoneConfig,
  ZoneId,
} from '../../models/tome.model';
import { TomeService } from '../../services/tome.service';
import { roundCoord } from '../../models/tome.model';

/**
 * Form for creating or editing a farm location.
 * Pure presentational — emits the (validated) location back to the parent.
 */
@Component({
  selector: 'woe-tome-form',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './tome-form.component.html',
  styleUrl: './tome-form.component.scss',
})
export class TomeFormComponent implements OnChanges {
  @Input() initial: FarmLocation | null = null;
  /** Pre-filled when the form is opened from a map-click. */
  @Input() zoneId: ZoneId = 'eastern-kingdoms';
  @Input() x = 0;
  @Input() y = 0;
  @Input({ required: true }) zones: ZoneConfig[] = [];
  /** Existing locations — used to autofill a tome name's other locations. */
  @Input() allLocations: FarmLocation[] = [];
  /**
   * Changes whenever the parent wants to open a *new editing session*
   * (e.g. click-to-place, edit a different pin). Use this instead of
   * `initial` to drive full resets — that way the form's other fields
   * are not wiped when only x/y change from a pin drag.
   */
  @Input() sessionKey = '';

  @Output() saved = new EventEmitter<FarmLocation>();
  @Output() cancelled = new EventEmitter<void>();
  /** Fires when the user clicks the Delete button while editing an
   *  existing pin. The parent is in charge of confirming + actually
   *  removing the location from the data store. */
  @Output() deleted = new EventEmitter<FarmLocation>();
  /** Fires while the user is typing in the X / Y inputs, so the
   *  parent can move the pin on the map in real time. */
  @Output() coordsChanged = new EventEmitter<{ x: number; y: number }>();

  readonly allSpecs = ALL_SPECS;
  readonly specLabels = SPEC_LABELS;

  protected formId = '';
  protected tomeId = '';
  protected tomeName = '';
  protected rarity: TomeRarity = 'epic';
  protected zone: ZoneId = 'eastern-kingdoms';
  protected xCoord = 0;
  protected yCoord = 0;
  protected placeName = '';
  protected mobsRaw = '';
  protected specs: Record<Spec, boolean> = {
    tank: false,
    'caster-dps': false,
    'melee-dps': false,
    'ranged-dps': false,
  };
  protected notes = '';

  ngOnChanges(changes: SimpleChanges): void {
    // Full reset only when the parent explicitly starts a new session,
    // or on the very first change (initial mount).
    const sessionChanged =
      !!changes['sessionKey'] &&
      changes['sessionKey'].currentValue !==
        changes['sessionKey'].previousValue;
    const firstMount =
      !!changes['initial'] && changes['initial'].firstChange;

    if (sessionChanged || firstMount) {
      this.resetFromInputs();
      return;
    }

    // Live coordinate updates from the parent (e.g. user dragging the
    // pin on the map). Only sync x/y — never wipe what the user has
    // already typed in the other fields.
    if (changes['x'] && !changes['x'].firstChange) {
      this.xCoord = this.x;
    }
    if (changes['y'] && !changes['y'].firstChange) {
      this.yCoord = this.y;
    }
  }

  private resetFromInputs(): void {
    if (this.initial) {
      this.formId = this.initial.id;
      this.tomeId = this.initial.tomeId;
      this.tomeName = this.initial.tomeName;
      this.rarity = this.initial.rarity;
      this.zone = this.initial.zone;
      this.xCoord = this.initial.x;
      this.yCoord = this.initial.y;
      this.placeName = this.initial.placeName;
      this.mobsRaw = this.initial.mobs.join('\n');
      this.specs = {
        tank: this.initial.specs.includes('tank'),
        'caster-dps': this.initial.specs.includes('caster-dps'),
        'melee-dps': this.initial.specs.includes('melee-dps'),
        'ranged-dps': this.initial.specs.includes('ranged-dps'),
      };
      this.notes = this.initial.notes ?? '';
    } else {
      this.formId = TomeService.newId();
      this.tomeId = '';
      this.tomeName = '';
      this.rarity = 'epic';
      this.zone = this.zoneId;
      this.xCoord = this.x;
      this.yCoord = this.y;
      this.placeName = '';
      this.mobsRaw = '';
      this.specs = {
        tank: false,
        'caster-dps': false,
        'melee-dps': false,
        'ranged-dps': false,
      };
      this.notes = '';
    }
  }

  /** Called by the X / Y number inputs whenever the user types in them. */
  protected onCoordInput(): void {
    const x = Number.isFinite(this.xCoord) ? this.xCoord : 0;
    const y = Number.isFinite(this.yCoord) ? this.yCoord : 0;
    this.coordsChanged.emit({ x, y });
  }

  protected onTomeNameBlur(): void {
    // If editing an existing tome name, reuse the existing tomeId so
    // we automatically link locations as siblings.
    if (this.initial) return;
    const match = this.allLocations.find(
      (l) => l.tomeName.trim().toLowerCase() === this.tomeName.trim().toLowerCase(),
    );
    if (match) {
      this.tomeId = match.tomeId;
      this.rarity = match.rarity;
    } else if (!this.tomeId) {
      this.tomeId = this.slug(this.tomeName);
    }
  }

  protected submit(): void {
    const tomeName = this.tomeName.trim();
    const placeName = this.placeName.trim();
    if (!tomeName || !placeName) return;

    const specs: Spec[] = (Object.entries(this.specs) as [Spec, boolean][])
      .filter(([, v]) => v)
      .map(([k]) => k);

    const mobs = this.mobsRaw
      .split(/\r?\n/)
      .map((m) => m.trim())
      .filter(Boolean);

    const location: FarmLocation = {
      id: this.formId || TomeService.newId(),
      tomeId: this.tomeId || this.slug(tomeName),
      tomeName,
      rarity: this.rarity,
      zone: this.zone,
      x: roundCoord(this.xCoord),
      y: roundCoord(this.yCoord),
      placeName,
      mobs,
      specs,
      notes: this.notes.trim() || undefined,
    };

    this.saved.emit(location);
  }

  protected onDelete(): void {
    if (this.initial) {
      this.deleted.emit(this.initial);
    }
  }

  private slug(s: string): string {
    return (
      'tome-' +
      s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
    );
  }
}
