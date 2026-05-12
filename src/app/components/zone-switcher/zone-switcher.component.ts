import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ZoneConfig, ZoneId } from '../../models/tome.model';

@Component({
  selector: 'woe-zone-switcher',
  standalone: true,
  imports: [],
  templateUrl: './zone-switcher.component.html',
  styleUrl: './zone-switcher.component.scss',
})
export class ZoneSwitcherComponent {
  @Input({ required: true }) zones: ZoneConfig[] = [];
  @Input({ required: true }) currentZoneId!: ZoneId;
  @Output() zoneSelected = new EventEmitter<ZoneId>();
}
