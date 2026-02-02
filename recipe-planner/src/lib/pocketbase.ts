import PocketBase from 'pocketbase';
import { getCurrentDbUrl, getCurrentEnvironment, setCurrentEnvironment, type DbEnvironment } from './db-config';

// Initialize PocketBase with current environment URL
let currentUrl = getCurrentDbUrl();
export let pb = new PocketBase(currentUrl);

// Disable auto-cancellation for overlapping requests
pb.autoCancellation(false);

/**
 * Get the current database environment
 */
export function getEnvironment(): DbEnvironment {
  return getCurrentEnvironment();
}

/**
 * Switch to a different database environment
 * @param env - The environment to switch to
 * @returns Promise that resolves when the switch is complete
 */
export function switchDatabase(env: DbEnvironment): Promise<void> {
  return new Promise((resolve) => {
    // Save the new environment
    setCurrentEnvironment(env);
    
    // Reload the page to reinitialize with the new database
    // This ensures a clean state and prevents any stale data issues
    window.location.reload();
    
    // Resolve immediately since reload will happen
    resolve();
  });
}

/**
 * Get the URL of the current database
 */
export function getDbUrl(): string {
  return currentUrl;
}

/**
 * Reinitialize the PocketBase client with a new URL
 * This is called after database switching
 */
export function reinitializePocketBase(): void {
  currentUrl = getCurrentDbUrl();
  pb = new PocketBase(currentUrl);
  pb.autoCancellation(false);
}