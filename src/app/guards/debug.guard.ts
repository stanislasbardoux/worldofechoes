import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { environment } from '../../environments/environment';

/**
 * Allow navigation only when the app is running in debug (development) mode.
 * In production the admin/creation page is silently redirected to '/'.
 */
export const debugGuard: CanActivateFn = () => {
  if (environment.debug) {
    return true;
  }
  const router = inject(Router);
  return router.parseUrl('/');
};
