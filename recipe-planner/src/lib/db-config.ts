/**
 * Database Configuration
 * 
 * Manages database environment selection and URLs
 */

export type DbEnvironment = 'production' | 'test';

export interface DbConfig {
  production: string;
  test: string;
}

// Database URLs come from BUILD-TIME env (Vite import.meta.env.VITE_*). The API
// base is deploy-specific, so it is injected at build time — never hardcoded to
// a host. In a production build a missing VITE_POCKETBASE_URL is a hard failure
// rather than a silent fall back to a stale/dead host (no NAS IP literal). In
// local dev we fall back to localhost so `npm run dev` works without a .env.
const prodUrl = import.meta.env.VITE_POCKETBASE_URL;
if (import.meta.env.PROD && !prodUrl) {
  throw new Error(
    'VITE_POCKETBASE_URL must be set at build time for a production build ' +
    '(the PocketBase base URL is deploy-specific; there is no default).'
  );
}

export const DB_URLS: DbConfig = {
  production: prodUrl || 'http://127.0.0.1:8090',
  // The "test" environment is legacy — pre-migration it was a separate staging
  // instance. When no dedicated test URL is provided it falls back to the
  // production URL, so a single-instance deployment never points at a dead host.
  test: import.meta.env.VITE_POCKETBASE_TEST_URL || prodUrl || 'http://127.0.0.1:8091',
};

// LocalStorage key for persisting database selection
export const DB_ENV_STORAGE_KEY = 'pb_db_environment';

// Default to production. (Was 'test', which — together with the removed hardcoded
// fallback — sent a fresh browser to a dead http:// host and tripped a
// mixed-content hang. Production is the correct default post-migration.)
export const DEFAULT_ENVIRONMENT: DbEnvironment = 'production';

/**
 * Get the current database environment from localStorage
 */
export function getCurrentEnvironment(): DbEnvironment {
  const stored = localStorage.getItem(DB_ENV_STORAGE_KEY);
  if (stored === 'production' || stored === 'test') {
    return stored;
  }
  return DEFAULT_ENVIRONMENT;
}

/**
 * Set the current database environment in localStorage
 */
export function setCurrentEnvironment(env: DbEnvironment): void {
  localStorage.setItem(DB_ENV_STORAGE_KEY, env);
}

/**
 * Get the URL for the current database environment
 */
export function getCurrentDbUrl(): string {
  const env = getCurrentEnvironment();
  return DB_URLS[env];
}

/**
 * Get the URL for a specific database environment
 */
export function getDbUrl(env: DbEnvironment): string {
  return DB_URLS[env];
}
