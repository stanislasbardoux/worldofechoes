import { Component, EventEmitter, Input, Output } from '@angular/core';
import {
  FarmLocation,
  SPEC_LABELS,
  Spec,
  ZoneId,
} from '../../models/tome.model';

export interface JumpToLocationEvent {
  locationId: string;
}

@Component({
  selector: 'woe-tome-panel',
  standalone: true,
  imports: [],
  templateUrl: './tome-panel.component.html',
  styleUrl: './tome-panel.component.scss',
})
export class TomePanelComponent {
  @Input({ required: true }) location: FarmLocation | null = null;
  /** Other farm locations of the same tome (used for hotlinks). */
  @Input() siblings: FarmLocation[] = [];
  /** Zone name lookup, so we can label cross-zone hotlinks. */
  @Input() zoneNames: Record<ZoneId, string> = {
    'eastern-kingdoms': 'Eastern Kingdoms',
    'kalimdor': 'Kalimdor',
    'outland': 'Outland',
    'northrend': 'Northrend',
  };
  /** Show edit/delete buttons (debug only). */
  @Input() editable = false;

  @Output() closed = new EventEmitter<void>();
  @Output() jumpTo = new EventEmitter<JumpToLocationEvent>();
  @Output() editClicked = new EventEmitter<FarmLocation>();
  @Output() deleteClicked = new EventEmitter<FarmLocation>();

  readonly specLabels = SPEC_LABELS;

  specLabel(spec: Spec): string {
    return SPEC_LABELS[spec];
  }
}
