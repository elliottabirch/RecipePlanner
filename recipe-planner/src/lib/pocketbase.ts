import PocketBase from 'pocketbase';

// Update this to your PocketBase server URL
const POCKETBASE_URL = import.meta.env.VITE_POCKETBASE_URL || 'http://localhost:8090';

export const pb = new PocketBase(POCKETBASE_URL);

// Disable auto-cancellation for overlapping requests
pb.autoCancellation(false);