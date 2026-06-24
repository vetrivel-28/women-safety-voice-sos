const rawUrl = process.env.EXPO_PUBLIC_API_BASE_URL || process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:8000';
export const API_BASE_URL = rawUrl.replace(/\/health\/?$/, '').replace(/\/api\/?$/, '').replace(/\/$/, '');

console.log(`[API] Base URL: ${API_BASE_URL}`);

export const apiClient = async (endpoint: string, options: RequestInit = {}) => {
  const url = `${API_BASE_URL}${endpoint}`;
  const response = await fetch(url, options);
  console.log(`[API] ${options.method || 'GET'} ${endpoint} → ${response.status}`);
  return response;
};
