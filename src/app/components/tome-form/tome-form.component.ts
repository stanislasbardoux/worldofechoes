import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ALL_SPECS,
  FarmLocation,
  SPEC_LABELS,
  Spec,
  Tome,
  TomeRarity,
  ZoneConfig,
  ZoneId,
} from '../../models/tome.model';
import { TomeService } from '../../services/tome.service';
import { roundCoord } from '../../models/tome.model';

export interface TomeFormSaveEvent {
  location: FarmLocation;
  tome: Tome;
}

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
  private readonly host = inject(ElementRef<HTMLElement>);

  @Input() initial: FarmLocation | null = null;
  /** Pre-filled when the form is opened from a map-click. */
  @Input() zoneId: ZoneId = 'eastern-kingdoms';
  @Input() x = 0;
  @Input() y = 0;
  @Input({ required: true }) zones: ZoneConfig[] = [];
  /** Canonical tome catalog for the name combobox. */
  @Input() allTomes: Tome[] = [];
  /**
   * Changes whenever the parent wants to open a *new editing session*
   * (e.g. click-to-place, edit a different pin). Use this instead of
   * `initial` to drive full resets — that way the form's other fields
   * are not wiped when only x/y change from a pin drag.
   */
  @Input() sessionKey = '';

  @Output() saved = new EventEmitter<TomeFormSaveEvent>();
  @Output() cancelled = new EventEmitter<void>();
  /** Fires when the user clicks the Delete button while editing an
   *  existing pin. The parent is in charge of confirming + actually
   *  removing the location from the data store. */
  @Output() deleted = new EventEmitter<FarmLocation>();
  /** Fires while the user is typing in the X / Y inputs, so the
   *  parent can move the pin on the map in real time. */
  @Output() coordsChanged = new EventEmitter<{ x: number; y: number }>();
  /** Fires when the selected tome quality changes (for draft pin color). */
  @Output() tomeQualityChanged = new EventEmitter<TomeRarity>();

  @ViewChild('tomeInput') tomeInputRef?: ElementRef<HTMLInputElement>;

  readonly allSpecs = ALL_SPECS;
  readonly specLabels = SPEC_LABELS;

  protected formId = '';
  protected tomeId = '';
  protected tomeName = '';
  protected quality: TomeRarity = 'epic';
  protected description = '';
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

  protected tomeDropdownOpen = false;
  protected showAllTomes = false;

  ngOnChanges(changes: SimpleChanges): void {
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

    if (changes['x'] && !changes['x'].firstChange) {
      this.xCoord = this.x;
    }
    if (changes['y'] && !changes['y'].firstChange) {
      this.yCoord = this.y;
    }
  }

  @HostListener('document:click', ['$event'])
  protected onDocClick(ev: MouseEvent): void {
    if (!this.host.nativeElement.contains(ev.target as Node)) {
      this.tomeDropdownOpen = false;
      this.showAllTomes = false;
    }
  }

  protected filteredTomes(): Tome[] {
    const sorted = [...this.allTomes].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    if (this.showAllTomes) return sorted;
    const q = this.tomeName.trim().toLowerCase();
    if (!q) return sorted.slice(0, 12);
    return sorted.filter((t) => t.name.toLowerCase().includes(q)).slice(0, 12);
  }

  protected onTomeNameInput(): void {
    this.tomeDropdownOpen = true;
    this.showAllTomes = false;
    const match = this.findTomeByName(this.tomeName);
    if (match) {
      this.applyTome(match);
    } else {
      this.tomeId = '';
    }
  }

  protected toggleTomeDropdown(): void {
    this.tomeDropdownOpen = !this.tomeDropdownOpen;
    this.showAllTomes = this.tomeDropdownOpen;
    this.tomeInputRef?.nativeElement.focus();
  }

  protected selectTome(tome: Tome): void {
    this.applyTome(tome);
    this.tomeDropdownOpen = false;
    this.showAllTomes = false;
  }

  protected onQualityChanged(): void {
    this.tomeQualityChanged.emit(this.quality);
  }

  private resetFromInputs(): void {
    this.tomeDropdownOpen = false;
    this.showAllTomes = false;

    if (this.initial) {
      this.formId = this.initial.id;
      this.tomeId = this.initial.tomeId;
      const tome = this.allTomes.find((t) => t.id === this.initial!.tomeId);
      this.tomeName = tome?.name ?? '';
      this.quality = tome?.quality ?? 'rare';
      this.description = tome?.description ?? '';
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
      this.quality = 'epic';
      this.description = '';
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

    this.tomeQualityChanged.emit(this.quality);
  }

  private applyTome(tome: Tome): void {
    this.tomeId = tome.id;
    this.tomeName = tome.name;
    this.quality = tome.quality;
    this.description = tome.description;
    this.tomeQualityChanged.emit(this.quality);
  }

  private findTomeByName(name: string): Tome | undefined {
    const q = name.trim().toLowerCase();
    if (!q) return undefined;
    return this.allTomes.find((t) => t.name.toLowerCase() === q);
  }

  /** Called by the X / Y number inputs whenever the user types in them. */
  protected onCoordInput(): void {
    const x = Number.isFinite(this.xCoord) ? this.xCoord : 0;
    const y = Number.isFinite(this.yCoord) ? this.yCoord : 0;
    this.coordsChanged.emit({ x, y });
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

    const existing = this.findTomeByName(tomeName);
    const tomeId =
      existing?.id ?? (this.tomeId || TomeService.slugTomeId(tomeName));

    const tome: Tome = {
      id: tomeId,
      name: tomeName,
      quality: this.quality,
      description: this.description.trim(),
    };

    const location: FarmLocation = {
      id: this.formId || TomeService.newId(),
      tomeId,
      zone: this.zone,
      x: roundCoord(this.xCoord),
      y: roundCoord(this.yCoord),
      placeName,
      mobs,
      specs,
      notes: this.notes.trim() || undefined,
    };

    this.saved.emit({ location, tome });
  }

  protected onDelete(): void {
    if (this.initial) {
      this.deleted.emit(this.initial);
    }
  }
}
