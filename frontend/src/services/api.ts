import { User, AuthResponse } from '../types/auth';
import {
  Repository,
  RepositoryImportResponse,
  ProgressEventPayload,
} from '../types/repository';

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

/**
 * Import Public GitHub Repository
 */
export async function importRepository(
  githubUrl: string,
  defaultBranch: string = 'main',
  token: string
): Promise<{ data: RepositoryImportResponse | null; error: string | null }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/repositories/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        github_url: githubUrl,
        default_branch: defaultBranch,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMsg = data?.detail || `Import failed (HTTP ${response.status})`;
      return { data: null, error: errorMsg };
    }

    return { data, error: null };
  } catch (err: any) {
    return {
      data: null,
      error: err?.message || 'Network error initiating repository import',
    };
  }
}

/**
 * List User Repositories
 */
export async function fetchRepositories(
  token: string
): Promise<{ data: Repository[] | null; error: string | null }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/repositories`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMsg = data?.detail || `Failed to fetch repositories (HTTP ${response.status})`;
      return { data: null, error: errorMsg };
    }

    return { data, error: null };
  } catch (err: any) {
    return {
      data: null,
      error: err?.message || 'Network error fetching repositories',
    };
  }
}

/**
 * Delete Repository
 */
export async function deleteRepository(
  repositoryId: string,
  token: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/repositories/${repositoryId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok && response.status !== 204) {
      const data = await response.json().catch(() => ({}));
      return { success: false, error: data?.detail || `Failed to delete repository` };
    }

    return { success: true, error: null };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Network error deleting repository',
    };
  }
}

/**
 * Subscribe to SSE Analysis / Ingestion Progress Stream
 */
export function subscribeRepositoryProgress(
  repositoryId: string,
  token: string,
  onProgress: (event: ProgressEventPayload) => void,
  onComplete: () => void,
  onError: (err: any) => void
): () => void {
  const sseUrl = `${API_BASE_URL}/api/v1/repositories/${repositoryId}/progress?token=${encodeURIComponent(token)}`;
  const eventSource = new EventSource(sseUrl);

  eventSource.addEventListener('progress', (e: MessageEvent) => {
    try {
      const payload: ProgressEventPayload = JSON.parse(e.data);
      onProgress(payload);

      if (['COMPLETED', 'FAILED', 'READY'].includes(payload.status)) {
        eventSource.close();
        onComplete();
      }
    } catch (err) {
      console.warn('Failed to parse SSE payload:', e.data, err);
    }
  });

  eventSource.addEventListener('close', () => {
    eventSource.close();
    onComplete();
  });

  eventSource.onerror = (err) => {
    console.debug('SSE connection closed or error:', err);
    eventSource.close();
    onError(err);
  };

  // Return unsubscribe / cleanup function
  return () => {
    eventSource.close();
  };
}

/**
 * Scan Repository Workspace
 */
export async function scanRepository(
  repositoryId: string,
  token: string
): Promise<{ data: import('../types/scanner').RepositoryScanResponse | null; error: string | null }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/repositories/${repositoryId}/scan`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMsg = data?.detail || `Scan failed (HTTP ${response.status})`;
      return { data: null, error: errorMsg };
    }

    return { data, error: null };
  } catch (err: any) {
    return {
      data: null,
      error: err?.message || 'Network error scanning repository',
    };
  }
}

/**
 * Fetch Scanned Files for Repository
 */
export async function fetchRepositoryFiles(
  repositoryId: string,
  token: string
): Promise<{ data: import('../types/scanner').FileListResponse | null; error: string | null }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/repositories/${repositoryId}/files`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMsg = data?.detail || `Failed to fetch files (HTTP ${response.status})`;
      return { data: null, error: errorMsg };
    }

    return { data, error: null };
  } catch (err: any) {
    return {
      data: null,
      error: err?.message || 'Network error fetching files',
    };
  }
}

/**
 * Execute Tree-sitter Python Analysis
 */
export async function analyzePythonRepository(
  repositoryId: string,
  token: string
): Promise<{ data: import('../types/parser').PythonAnalysisResponse | null; error: string | null }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/repositories/${repositoryId}/analyze/python`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMsg = data?.detail || `Python analysis failed (HTTP ${response.status})`;
      return { data: null, error: errorMsg };
    }

    return { data, error: null };
  } catch (err: any) {
    return {
      data: null,
      error: err?.message || 'Network error executing Python analysis',
    };
  }
}

/**
 * Fetch Extracted AST Symbols
 */
export async function fetchRepositorySymbols(
  repositoryId: string,
  token: string
): Promise<{ data: import('../types/parser').SymbolListResponse | null; error: string | null }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/repositories/${repositoryId}/symbols`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMsg = data?.detail || `Failed to fetch symbols (HTTP ${response.status})`;
      return { data: null, error: errorMsg };
    }

    return { data, error: null };
  } catch (err: any) {
    return {
      data: null,
      error: err?.message || 'Network error fetching symbols',
    };
  }
}
