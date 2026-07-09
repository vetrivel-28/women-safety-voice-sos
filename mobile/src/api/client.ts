import axios from 'axios';
import { supabase } from '../lib/supabaseClient';

// Get backend URL
const getBaseUrl = () => {
  // First priority: Expo environment variable
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

  // Second priority: alternate Expo environment variable
  if (process.env.EXPO_PUBLIC_API_BASE_URL) {
    return process.env.EXPO_PUBLIC_API_BASE_URL;
  }

  // Fallback: deployed Render backend
  return 'https://women-safety-voice-sos.onrender.com';
};

const rawUrl = getBaseUrl();

export const API_BASE_URL = rawUrl
  .replace(/\/health\/?$/, '')
  .replace(/\/api\/?$/, '')
  .replace(/\/$/, '');

console.log(`[API] Base URL configured as: ${API_BASE_URL}`);

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
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

// Prevent duplicate log spam for recurring network errors
const lastNetworkErrors: Record<string, number> = {};

// Request Interceptor: Attach JWT and Log
apiClient.interceptors.request.use(
  async (config) => {
    (config as any).metadata = {
      startTime: Date.now(),
    };

    let hasJwt = false;

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.access_token) {
        config.headers.Authorization =
          `Bearer ${session.access_token}`;

        hasJwt = true;
      }
    } catch (e) {
      console.error('[API] Failed to get session', e);
    }

    console.log(
      `[API Request Start] ${config.method?.toUpperCase()} ${config.url}`
    );

    console.log('[API Request Details]', {
      baseURL: config.baseURL,
      headers: sanitizeForLog(config.headers),
      jwtPresent: hasJwt,
      payload: config.data,
      time: new Date().toISOString(),
    });

    return config;
  },
  (error) => {
    console.error('[API Request Error]', error);
    return Promise.reject(error);
  }
);

// Response Interceptor: Log and Format Errors
apiClient.interceptors.response.use(
  (response) => {
    const elapsed =
      Date.now() -
      ((response.config as any).metadata?.startTime || Date.now());

    const method = response.config.method?.toUpperCase();
    const url = response.config.url;

    if (Array.isArray(response.data)) {
      console.log(
        `[API Response] ${method} ${url} -> ${response.status}, count=${response.data.length}, elapsedMs=${elapsed}`
      );
    } else {
      console.log(
        `[API Response] ${method} ${url} -> ${response.status}, elapsedMs=${elapsed}`
      );
    }

    return response;
  },

  async (error) => {
    const config = error.config as any;

    const elapsed = config?.metadata?.startTime
      ? Date.now() - config.metadata.startTime
      : 'unknown';

    const method =
      config?.method?.toUpperCase() || 'UNKNOWN';

    const url =
      config?.url || 'UNKNOWN';

    // Handle cancelled requests
    if (
      axios.isCancel(error) ||
      error.code === 'ERR_CANCELED' ||
      error.message?.includes('canceled')
    ) {
      console.log(
        `[API] Request canceled: ${method} ${url}`
      );

      return Promise.reject(error);
    }

    // Backend returned an HTTP response
    if (error.response) {
      const status = error.response.status;

      console.error(
        `[API Error] ${method} ${url} -> ${status}, detail=${JSON.stringify(
          error.response.data?.detail || error.response.data
        )}, elapsedMs=${elapsed}`
      );

      // Try refreshing Supabase session once after 401
      if (status === 401 && !config._retry) {
        config._retry = true;

        try {
          console.log(
            '[API] Attempting session refresh after 401...'
          );

          const {
            data,
            error: refreshError,
          } = await supabase.auth.refreshSession();

          if (data?.session && !refreshError) {
            config.headers.Authorization =
              `Bearer ${data.session.access_token}`;

            return apiClient(config);
          }
        } catch (e) {
          console.error(
            '[API] Session refresh failed',
            e
          );
        }
      }

      // 503 remains an error.
      // Components should avoid wiping existing data on it.
    }

    // Request was sent but no HTTP response was received
    else if (error.request) {
      const logKey =
        `${config?.method?.toUpperCase()} ${config?.url}`;

      const now = Date.now();

      const lastLogged =
        lastNetworkErrors[logKey] || 0;

      if (now - lastLogged >= 60000) {
        lastNetworkErrors[logKey] = now;

        console.error(
          `[API Network Exception] ${logKey}`
        );

        console.error(
          '[API Exception Details]',
          {
            elapsedMs: elapsed,
            message: error.message,
            code: error.code,
          }
        );
      }

      // Enhance network error
      error.isNetworkError = true;

      error.customMessage = __DEV__
        ? `Cannot reach deployed backend.

[DEV DETAILS]
Base URL: ${config?.baseURL}

Check:
- Internet connection
- Render service status
- Backend health endpoint
- Render cold-start delay`
        : `Cannot reach the backend service. Please check your internet connection and try again.`;
    }

    // Axios/configuration error
    else {
      console.error(
        '[API Error]',
        error.message
      );
    }

    return Promise.reject(error);
  }
);
