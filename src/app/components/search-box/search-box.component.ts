import {
  Component,
  ElementRef,
  HostListener,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';

import { TomeService } from '../../services/tome.service';
import { FarmLocation, TomeRarity, ZoneId } from '../../models/tome.model';

/**
 * One row in the search dropdown — represents a logical *tome*
 * (grouped across all its farm locations), not a single pin.
 */
interface SearchResult {
  tomeId: string;
  tomeName: string;
  quality: TomeRarity;
  /** All locations for this tome. */
  locations: FarmLocation[];
  /** The pin we'll jump to when this result is picked (first location). */
  firstLocation: FarmLocation;
}

@Component({
  selector: 'woe-search-box',
  standalone: true,
  imports: [],
  templateUrl: './search-box.component.html',
  styleUrl: './search-box.component.scss',
})
export class SearchBoxComponent {
  private readonly tomes = inject(TomeService);
  private readonly router = inject(Router);
  private readonly host = inject(ElementRef<HTMLElement>);

  @ViewChild('input', { static: true }) inputRef!: ElementRef<HTMLInputElement>;

  protected readonly query = signal('');
  protected readonly open = signal(false);
  protected readonly activeIndex = signal(0);

  /** All tomes that have at least one pin, sorted alphabetically. */
  private readonly allTomes = computed<SearchResult[]>(() => {
    const byTome = new Map<string, SearchResult>();
    for (const loc of this.tomes.locations()) {
      const meta = this.tomes.getTome(loc.tomeId);
      const existing = byTome.get(loc.tomeId);
      if (existing) {
        existing.locations.push(loc);
      } else {
        byTome.set(loc.tomeId, {
          tomeId: loc.tomeId,
          tomeName: meta?.name ?? 'Unknown tome',
          quality: meta?.quality ?? 'rare',
          locations: [loc],
          firstLocation: loc,
        });
      }
    }
    return [...byTome.values()].sort((a, b) =>
      a.tomeName.localeCompare(b.tomeName),
    );
  });

  protected readonly results = computed<SearchResult[]>(() => {
    const q = this.query().trim().toLowerCase();
    const all = this.allTomes();
    if (!q) return all.slice(0, 8);
    return all.filter((t) => t.tomeName.toLowerCase().includes(q)).slice(0, 12);
  });

  protected readonly hasResults = computed(() => this.results().length > 0);

  // ──────────────────────────────────────────────────────────────────
  // Input handlers
  // ──────────────────────────────────────────────────────────────────

  protected onQueryChange(value: string): void {
    this.query.set(value);
    this.activeIndex.set(0);
    this.open.set(true);
  }

  protected onFocus(): void {
    this.open.set(true);
  }

  protected onKeydown(ev: KeyboardEvent): void {
    const results = this.results();
    if (!this.open()) {
      if (ev.key === 'ArrowDown' || ev.key === 'Enter') {
        this.open.set(true);
        ev.preventDefault();
      }
      return;
    }

    switch (ev.key) {
      case 'ArrowDown':
        ev.preventDefault();
        this.activeIndex.update((i) => Math.min(results.length - 1, i + 1));
        break;
      case 'ArrowUp':
        ev.preventDefault();
        this.activeIndex.update((i) => Math.max(0, i - 1));
        break;
      case 'Enter':
        ev.preventDefault();
        if (results[this.activeIndex()]) {
          this.pick(results[this.activeIndex()]);
        }
        break;
      case 'Escape':
        this.open.set(false);
        this.inputRef.nativeElement.blur();
        break;
    }
  }

  @HostListener('document:click', ['$event'])
  protected onDocClick(ev: MouseEvent): void {
    if (!this.host.nativeElement.contains(ev.target as Node)) {
      this.open.set(false);
    }
  }

  protected pick(result: SearchResult): void {
    this.open.set(false);
    this.query.set('');
    this.inputRef.nativeElement.blur();

    const target = result.firstLocation;
    // Make sure we're on the home page (search may have been triggered
    // from /admin) and then ask the home page to focus the pin.
    this.router.navigate(['/']).then(() => {
      this.tomes.requestFocusLocation(target.id);
    });
  }

  /** Format the zone(s) where this tome can be farmed for the dropdown. */
  protected zoneSummary(result: SearchResult): string {
    const zones = new Set<ZoneId>();
    for (const l of result.locations) zones.add(l.zone);
    const zoneNames = this.tomes.zones();
    const lookup = new Map(zoneNames.map((z) => [z.id, z.name]));
    return [...zones].map((z) => lookup.get(z) ?? z).join(' • ');
  }
}
