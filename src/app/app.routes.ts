import { Routes } from '@angular/router';
import { debugGuard } from './guards/debug.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/home/home.component').then((m) => m.HomeComponent),
    title: 'World of Echoes',
  },
  {
    path: 'admin',
    canActivate: [debugGuard],
    loadComponent: () =>
      import('./pages/admin/admin.component').then((m) => m.AdminComponent),
    title: 'World of Echoes — Admin',
  },
  { path: '**', redirectTo: '' },
];
