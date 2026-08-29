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
