const API_URL = 'http://localhost:8000';

/**
 * Fetch wrapper that automatically includes JWT token
 */
export const fetchWithAuth = async (endpoint: string, options: RequestInit = {}) => {
  const token = localStorage.getItem('nexus_token');
  
  if (!token) {
    throw new Error('No authentication token found');
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...options.headers,
  };

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  // Handle 401 Unauthorized - token expired or invalid
  if (response.status === 401) {
    localStorage.removeItem('nexus_token');
    localStorage.removeItem('nexus_user');
    window.location.href = '/auth';
    throw new Error('Session expired. Please login again.');
  }

  // Handle 403 Forbidden - user doesn't own this resource
  if (response.status === 403) {
    throw new Error('Access denied to this resource');
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `HTTP ${response.status}`);
  }

  return response;
};

export { API_URL };