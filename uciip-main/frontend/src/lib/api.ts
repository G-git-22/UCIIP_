/**
 * Utility for interacting with the UCIIP Backend API
 */

export interface BackendHealth {
  status: string;
  message: string;
  timestamp: string;
  version: string;
}

/**
 * Checks the connectivity and health of the backend server
 */
export async function checkBackendHealth(): Promise<BackendHealth> {
  try {
    const response = await fetch('/api/health');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Failed to connect to backend:', error);
    throw error;
  }
}

// --- Auth API ---
export async function loginToBackend(credentials: any): Promise<any> {
  return fetchFromBackend('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials)
  });
}

// --- User Profile API ---
export async function getProfileFromBackend(): Promise<any> {
  return fetchFromBackend('/user/profile');
}

export async function updateProfileOnBackend(profile: any): Promise<any> {
  return fetchFromBackend('/user/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile)
  });
}

// --- App Settings API ---
export async function getSettingsFromBackend(): Promise<any> {
  return fetchFromBackend('/settings');
}

export async function updateSettingsOnBackend(settings: any): Promise<any> {
  return fetchFromBackend('/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings)
  });
}

// --- Case History API ---
export async function getCasesFromBackend(): Promise<any> {
  return fetchFromBackend('/cases');
}

export async function updateCaseOnBackend(id: string, updates: any): Promise<any> {
  return fetchFromBackend(`/cases/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
}

// --- Recent Files API ---
export async function getFilesFromBackend(): Promise<any> {
  return fetchFromBackend('/files');
}

/**
 * Generic fetch wrapper for future backend endpoints
 */
export async function fetchFromBackend<T>(endpoint: string, options?: RequestInit): Promise<T> {
  // Support VITE_API_URL for production deployments (like Vercel to Render)
  // If not set, it defaults to the local development proxy (/api)
  const API_BASE = import.meta.env.VITE_API_URL || '';
  const basePath = endpoint.startsWith('/') ? `/api${endpoint}` : `/api/${endpoint}`;
  const url = `${API_BASE}${basePath}`;
  
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Backend request failed: ${response.status} - ${errorText}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`API Error (${endpoint}):`, error);
    throw error;
  }
}
