import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { environment } from '../environments/environment';
import { SearchBoxComponent } from './components/search-box/search-box.component';
import { TomeService } from './services/tome.service';

@Component({
  selector: 'woe-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, SearchBoxComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  protected readonly debug = environment.debug;

  constructor() {
    // Trigger initial data load early so the search box already has
    // results to show when the user first focuses it on /admin.
    inject(TomeService).load();
  }
}
