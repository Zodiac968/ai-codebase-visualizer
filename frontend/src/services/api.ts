import { User, AuthResponse } from '../types/auth';

export interface HealthResponse {
  status: string;
  app: string;
  version: string;
  environment: string;
  databases: {
    postgres: string;
    neo4j: string;
  };
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

/**
 * Health Check API
 */
export async function fetchHealth(): Promise<{ data: HealthResponse | null; error: string | null }> {
  try {
    const response = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      return {
        data: null,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const data: HealthResponse = await response.json();
    return { data, error: null };
  } catch (err: any) {
    return {
      data: null,
      error: err?.message || 'Failed to connect to backend service',
    };
  }
}

/**
 * Register User API
 */
export async function registerUser(
  email: string,
  password: string
): Promise<{ data: AuthResponse | null; error: string | null }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMsg = data?.detail || `Registration failed (HTTP ${response.status})`;
      return { data: null, error: errorMsg };
    }

    return { data, error: null };
  } catch (err: any) {
    return {
      data: null,
      error: err?.message || 'Network error during registration',
    };
  }
}

/**
 * Login User API
 */
export async function loginUser(
  email: string,
  password: string
): Promise<{ data: AuthResponse | null; error: string | null }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMsg = data?.detail || `Login failed (HTTP ${response.status})`;
      return { data: null, error: errorMsg };
    }

    return { data, error: null };
  } catch (err: any) {
    return {
      data: null,
      error: err?.message || 'Network error during login',
    };
  }
}

/**
 * Fetch Current Authenticated User (/me)
 */
export async function fetchCurrentUser(
  token: string
): Promise<{ data: User | null; error: string | null }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/me`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMsg = data?.detail || `Failed to fetch user (HTTP ${response.status})`;
      return { data: null, error: errorMsg };
    }

    return { data, error: null };
  } catch (err: any) {
    return {
      data: null,
      error: err?.message || 'Network error fetching current user',
    };
  }
}
