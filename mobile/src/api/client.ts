import axios from 'axios';
import Constants from 'expo-constants';
import { supabase } from '../lib/supabaseClient';

// Auto-detect backend URL
const getBaseUrl = () => {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  
  if (process.env.EXPO_PUBLIC_API_BASE_URL) {
    return process.env.EXPO_PUBLIC_API_BASE_URL;
  }

  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const lanIp = hostUri.split(':')[0];
    return `http://${lanIp}:8000`;
  }
  
  return 'http://127.0.0.1:8000';
};

const rawUrl = getBaseUrl();
export const API_BASE_URL = rawUrl.replace(/\/health\/?$/, '').replace(/\/api\/?$/, '').replace(/\/$/, '');

console.log(`[API] Base URL configured as: ${API_BASE_URL}`);

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Helper to sanitize logs to prevent JWT leaks
const sanitizeForLog = (headers: any) => {
  if (!headers) return headers;
  const sanitized = { ...headers };
  if (sanitized.Authorization) {
    sanitized.Authorization = 'Bearer <redacted>';
  }
  return sanitized;
};

// Request Interceptor: Attach JWT and Log
apiClient.interceptors.request.use(
  async (config) => {
    (config as any).metadata = { startTime: Date.now() }; // Attach start time for elapsed time
    
    let hasJwt = false;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        config.headers.Authorization = `Bearer ${session.access_token}`;
        hasJwt = true;
      }
    } catch (e) {
      console.error('[API] Failed to get session', e);
    }

    console.log(`[API Request Start] ${config.method?.toUpperCase()} ${config.url}`);
    console.log(`[API Request Details]`, {
      baseURL: config.baseURL,
      headers: sanitizeForLog(config.headers),
      jwtPresent: hasJwt,
      payload: config.data,
      time: new Date().toISOString()
    });

    return config;
  },
  (error) => {
    console.error(`[API Request Error]`, error);
    return Promise.reject(error);
  }
);

// Response Interceptor: Log and Format Errors
apiClient.interceptors.response.use(
  (response) => {
    const elapsed = Date.now() - ((response.config as any).metadata?.startTime || Date.now());
    console.log(`[API Response] ${response.config.method?.toUpperCase()} ${response.config.url} -> Status: ${response.status}`);
    console.log(`[API Response Details]`, {
      elapsedMs: elapsed,
      body: response.data
    });
    return response;
  },
  async (error) => {
    const config = error.config as any;
    const elapsed = config?.metadata?.startTime ? Date.now() - config.metadata.startTime : 'unknown';

    if (error.response) {
      console.error(`[API Response Error] ${config?.method?.toUpperCase()} ${config?.url} -> Status: ${error.response.status}`);
      console.error(`[API Error Details]`, {
        elapsedMs: elapsed,
        body: error.response.data,
        headers: error.response.headers
      });
    } else if (error.request) {
      console.error(`[API Network Exception] ${config?.method?.toUpperCase()} ${config?.url}`);
      console.error(`[API Exception Details]`, {
        elapsedMs: elapsed,
        message: error.message,
        code: error.code
      });
      
      // Enhance network error
      error.isNetworkError = true;
      error.customMessage = `Cannot reach backend.\nBackend URL: ${config?.baseURL}\n\nPossible causes:\n• backend not running\n• phone not on same Wi-Fi\n• firewall\n• invalid backend URL`;
    } else {
      console.error(`[API Error]`, error.message);
    }

    // Retry logic for transient failures (e.g. Network Error or 5xx)
    if (!config || !config.retryCount) {
      if (config) config.retryCount = 0;
    }
    
    const MAX_RETRIES = 2;
    if (config && config.retryCount < MAX_RETRIES && (error.isNetworkError || (error.response && error.response.status >= 500))) {
      config.retryCount += 1;
      console.log(`[API Retry] Retrying request ${config.url} (${config.retryCount}/${MAX_RETRIES})...`);
      // Wait for a brief delay before retrying
      await new Promise(resolve => setTimeout(resolve, 1000 * config.retryCount));
      return apiClient(config);
    }

    return Promise.reject(error);
  }
);
