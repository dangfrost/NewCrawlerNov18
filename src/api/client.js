// API client for Railway backend
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

// Get auth token from your auth provider
// TODO: Update this to match your authentication system
function getAuthToken() {
  // For now, return a placeholder token
  // Replace this with your actual auth token retrieval logic
  return localStorage.getItem('auth_token') || 'placeholder-token';
}

async function apiRequest(endpoint, options = {}) {
  try {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getAuthToken()}`,
      ...options.headers,
    };

    console.log(`API Request: ${options.method || 'GET'} ${url}`);

    const response = await fetch(url, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`API Error: ${response.status}`, data);
      throw new Error(data.error || `Request failed with status ${response.status}`);
    }

    console.log(`API Response:`, data);
    return data;
  } catch (error) {
    console.error(`API call error:`, error);
    throw error;
  }
}

// Instance API
export const instancesApi = {
  list: async () => {
    const result = await apiRequest('/instances');
    return result.data;
  },

  get: async (id) => {
    const result = await apiRequest(`/instances/${id}`);
    return result.data;
  },

  create: async (instanceData) => {
    const result = await apiRequest('/instances', {
      method: 'POST',
      body: JSON.stringify(instanceData),
    });
    return result.data;
  },

  update: async (id, instanceData) => {
    const result = await apiRequest(`/instances/${id}`, {
      method: 'PUT',
      body: JSON.stringify(instanceData),
    });
    return result.data;
  },

  delete: async (id) => {
    await apiRequest(`/instances/${id}`, {
      method: 'DELETE',
    });
  },
};

// Jobs API
export const jobsApi = {
  list: async (limit = 20) => {
    const result = await apiRequest(`/jobs?limit=${limit}`);
    return result.data;
  },

  get: async (id) => {
    const result = await apiRequest(`/jobs/${id}`);
    return result.data;
  },

  logs: async (job_id) => {
    const result = await apiRequest(`/jobs/${job_id}/logs`);
    return result.data;
  },
};

export default {
  instances: instancesApi,
  jobs: jobsApi,
};
