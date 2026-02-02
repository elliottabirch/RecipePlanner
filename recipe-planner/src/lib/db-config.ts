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

// Database URLs from environment variables
export const DB_URLS: DbConfig = {
  production: import.meta.env.VITE_POCKETBASE_URL || 'http://192.168.50.95:8090',
  test: import.meta.env.VITE_POCKETBASE_TEST_URL || 'http://192.168.50.95:8091',
};

// LocalStorage key for persisting database selection
export const DB_ENV_STORAGE_KEY = 'pb_db_environment';

// Default to test for safety
export const DEFAULT_ENVIRONMENT: DbEnvironment = 'test';

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
