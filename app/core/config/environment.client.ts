// app/core/config/environment.client.ts
// Browser-compatible version of environment configuration

// Type definitions for environment values
type EnvValue = string | boolean | number | undefined;

// Basic environment configuration with defaults for client
const clientEnvDefaults = {
  // Public environment variables
  VITE_PUBLIC_API_URL: 'http://localhost:3000/api',
  VITE_PUBLIC_ENV: 'development',
  VITE_DEBUG_MODE: false,
  VITE_LOCALE: 'en-US',
  VITE_KRATOS_BASE_URL: 'http://localhost:4433',
  
  // Logging defaults
  LOG_LEVEL: 'debug',
  LOG_TARGETS: 'console',
  LOG_FORMAT: 'pretty',
  REDACT_FIELDS: 'password,secret,token,authorization,cookie',
  TIMEZONE: 'America/Mexico_City',
};

// OpenTelemetry defaults for client
const clientOtelDefaults = {
  OTEL_ENABLED: false,
  OTEL_SERVICE_NAME: 'omni-iam-client',
  OTEL_SERVICE_VERSION: '1.0.0',
};

// Load environment variables from browser context
function loadRawEnv(): Record<string, EnvValue> {
  const env: Record<string, EnvValue> = {};
  
  // Browser environment variables (client-side)
  if (typeof window !== 'undefined' && typeof import.meta !== 'undefined') {
    Object.keys(import.meta.env).forEach(key => {
      env[key] = import.meta.env[key];
    });
  }
  
  return env;
}

// Raw environment variables
export const rawEnv = loadRawEnv();

// Export defaults for other modules
export const logDefaults = {
  LOG_LEVEL: clientEnvDefaults.LOG_LEVEL,
  LOG_TARGETS: clientEnvDefaults.LOG_TARGETS,
  LOG_FORMAT: clientEnvDefaults.LOG_FORMAT,
  LOG_FILE_PATH: './logs', // Not used in browser but included for API compatibility
  LOG_INCLUDE_TIMESTAMP: true,
  LOG_INCLUDE_HOSTNAME: true,
  CORRELATION_ID_HEADER: 'X-Correlation-ID',
  REDACT_FIELDS: clientEnvDefaults.REDACT_FIELDS,
  TIMEZONE: clientEnvDefaults.TIMEZONE,
};

// Export OpenTelemetry defaults
export const otelDefaults = {
  OTEL_ENABLED: String(clientOtelDefaults.OTEL_ENABLED),
  OTEL_SERVICE_NAME: clientOtelDefaults.OTEL_SERVICE_NAME,
  OTEL_SERVICE_VERSION: clientOtelDefaults.OTEL_SERVICE_VERSION,
  OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4317',
};

// Helper function to get environment variable with fallback
export function getEnv(key: string, defaultValue?: string): string | undefined {
  return rawEnv[key] !== undefined ? String(rawEnv[key]) : defaultValue;
}

// Helper function to get boolean environment variable
export function getBoolEnv(key: string, defaultValue = false): boolean {
  const value = rawEnv[key];
  if (value === undefined) return defaultValue;
  return value === true || value === 'true';
}

// Helper function to get numeric environment variable
export function getNumEnv(key: string, defaultValue = 0): number {
  const value = rawEnv[key];
  if (value === undefined) return defaultValue;
  
  if (typeof value === 'number') return value;
  
  const num = parseInt(String(value), 10);
  return isNaN(num) ? defaultValue : num;
}

// Simplified safe log function for browser
export function safeLog(level: string, data: any): void {
  // For browser, just use console
  switch (level) {
    case 'trace': console.trace(data); break;
    case 'debug': console.debug(data); break;
    case 'info': console.info(data); break;
    case 'warn': console.warn(data); break;
    case 'error': console.error(data); break;
    case 'fatal': console.error(data); break;
    default: console.log(data);
  }
}