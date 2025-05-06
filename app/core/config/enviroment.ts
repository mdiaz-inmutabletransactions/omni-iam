// app/core/config/environment.ts
// This module loads raw environment variables with basic defaults
// Both ViteEnv and LogManager can import from this

// Load environment variables directly from process.env or import.meta.env
function loadRawEnv() {
    const env: Record<string, string | undefined> = {};
    
    // Browser environment variables (client-side)
    if (typeof window !== 'undefined' && 'import' in window) {
      Object.keys(import.meta.env).forEach(key => {
        env[key] = import.meta.env[key];
      });
    }
    
    // Server environment variables
    if (typeof process !== 'undefined' && process.env) {
      Object.keys(process.env).forEach(key => {
        env[key] = process.env[key];
      });
    }
    
    return env;
  }
  
  // Basic environment configuration with basic defaults
  // These defaults should be minimal and not use any complex types
  export const rawEnv = loadRawEnv();
  
  // Basic defaults for logging (simple string values only)
  export const logDefaults = {
    LOG_LEVEL: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    LOG_TARGETS: process.env.NODE_ENV === 'production' ? 'file,opentelemetry' : 'console,file',
    LOG_FORMAT: process.env.NODE_ENV === 'production' ? 'json' : 'pretty',
    LOG_FILE_PATH: './logs',
    LOG_INCLUDE_TIMESTAMP: 'true',
    LOG_INCLUDE_HOSTNAME: 'true',
    CORRELATION_ID_HEADER: 'X-Correlation-ID',
    REDACT_FIELDS: 'password,secret,token,authorization,cookie',
  };
  
  // Basic defaults for OpenTelemetry (simple string values only)
  export const otelDefaults = {
    OTEL_ENABLED: process.env.NODE_ENV === 'production' ? 'true' : 'false',
    OTEL_SERVICE_NAME: 'omni-iam',
    OTEL_SERVICE_VERSION: '1.0.0',
    OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4317',
  };
  
  // Helper function to get environment variable with fallback
  export function getEnv(key: string, defaultValue?: string): string | undefined {
    return rawEnv[key] !== undefined ? rawEnv[key] : defaultValue;
  }
  
  // Helper function to get boolean environment variable
  export function getBoolEnv(key: string, defaultValue = false): boolean {
    const value = rawEnv[key];
    if (value === undefined) return defaultValue;
    return value === 'true';
  }
  
  // Helper function to get numeric environment variable
  export function getNumEnv(key: string, defaultValue = 0): number {
    const value = rawEnv[key];
    if (value === undefined) return defaultValue;
    const num = parseInt(value, 10);
    return isNaN(num) ? defaultValue : num;
  }
  
  // Basic log function that works without dependencies
  export function safeLog(level: string, msg: string | object, ...args: any[]): void {
    const logObj = typeof msg === 'string' ? { msg } : msg;
    
    switch (level) {
      case 'debug':
        console.debug(logObj, ...args);
        break;
      case 'info':
        console.info(logObj, ...args);
        break;
      case 'warn':
        console.warn(logObj, ...args);
        break;
      case 'error':
        console.error(logObj, ...args);
        break;
      default:
        console.log(logObj, ...args);
    }
  }