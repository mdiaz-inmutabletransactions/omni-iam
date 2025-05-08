// app/core/config/environment.ts
// This is a shared entry point that exports a common API

// For server-side only capabilities
let fs: any;
let path: any;
let os: any;
let DateTime: any;
let isNodeEnvironment = false;

// Detect environment safely
try {
  isNodeEnvironment = typeof process !== 'undefined' && 
    process.versions != null && 
    process.versions.node != null;
  
  // Only import Node.js modules if we're in a Node.js environment
  if (isNodeEnvironment) {
    
    const fsModule = await import('node:fs');
    const pathModule = await import('node:path');
    const osModule = await import('node:os');
    const luxonModule = await import('luxon');

    fs = fsModule.default;
    path = pathModule.default;
    os = osModule.default;
    DateTime  = luxonModule.DateTime;
  }
} catch (e) {
  // Not in Node.js environment, or imports failed
  console.warn('Running in browser environment or imports failed:', e);
}

// Helper to get the system hostname
function getSystemHostname(): string {
  try {
    // In Node.js environment
    if (isNodeEnvironment && os) {
      return os.hostname();
    }
    
    // In browser environment
    if (typeof window !== 'undefined' && window.location) {
      return window.location.hostname;
    }
    
    // Fallback to environment variable
    if (typeof process !== 'undefined' && process.env) {
      const envHostname = process.env.HOSTNAME || process.env.COMPUTERNAME;
      if (envHostname) {
        return envHostname;
      }
    }
    
    // Final fallback
    return 'unknown-host';
  } catch (error) {
    // If anything fails, return a default value
    return 'unknown-host';
  }
}

// Load environment variables from the appropriate source
function loadRawEnv() {
  const env: Record<string, string | undefined> = {};
  
  // Browser environment variables (client-side)
  if (typeof window !== 'undefined' && typeof import.meta !== 'undefined') {
    try {
      Object.keys(import.meta.env).forEach(key => {
        env[key] = import.meta.env[key];
      });
    } catch (e) {
      console.warn('Failed to load import.meta.env variables:', e);
    }
  }
  
  // Server environment variables
  if (typeof process !== 'undefined' && process.env) {
    try {
      Object.keys(process.env).forEach(key => {
        env[key] = process.env[key];
      });
    } catch (e) {
      console.warn('Failed to load process.env variables:', e);
    }
  }
  
  return env;
}

// Basic environment configuration with defaults
export const rawEnv = loadRawEnv();

// Basic defaults for logging
export const logDefaults = {
  LOG_LEVEL: isNodeEnvironment && process.env?.NODE_ENV === 'production' ? 'info' : 'debug',
  LOG_TARGETS: isNodeEnvironment && process.env?.NODE_ENV === 'production' ? 'file,opentelemetry' : 'console',
  LOG_FORMAT: isNodeEnvironment && process.env?.NODE_ENV === 'production' ? 'json' : 'pretty',
  LOG_FILE_PATH: './logs',
  LOG_INCLUDE_TIMESTAMP: 'true',
  LOG_INCLUDE_HOSTNAME: 'true',
  CORRELATION_ID_HEADER: 'X-Correlation-ID',
  REDACT_FIELDS: 'password,secret,token,authorization,cookie',
  TIMEZONE: 'America/Mexico_City',
};

// Basic defaults for OpenTelemetry
export const otelDefaults = {
  OTEL_ENABLED: isNodeEnvironment && process.env?.NODE_ENV === 'production' ? 'true' : 'false',
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
  const num = parseInt(String(value), 10);
  return isNaN(num) ? defaultValue : num;
}

// Simplified safe log function
export function safeLog(level: string, data: any, ...args: any[]): void {
  try {
    // Default to console logging for all environments
    switch (level) {
      case 'trace': console.trace(data, ...args); break;
      case 'debug': console.debug(data, ...args); break;
      case 'info': console.info(data, ...args); break;
      case 'warn': console.warn(data, ...args); break;
      case 'error': console.error(data, ...args); break;
      case 'fatal': console.error(data, ...args); break;
      default: console.log(data, ...args);
    }
    
    // Add file logging only in Node.js environment
    if (isNodeEnvironment && fs && path) {
      // Only attempt file logging if we have the right modules
      const logLevel = getEnv('LOG_LEVEL', logDefaults.LOG_LEVEL);
      const logTargets = getEnv('LOG_TARGETS', logDefaults.LOG_TARGETS)?.split(',') || ['console'];
      const timezone = getEnv('TIMEZONE', logDefaults.TIMEZONE) || 'UTC';
      
      // Check if file logging is enabled
      if (logTargets.includes('file')) {
        try {
          const logDir = getEnv('LOG_FILE_PATH', logDefaults.LOG_FILE_PATH) || './logs';
          const logFile = path.join(logDir, 'app.log');
          
          // Create log directory if it doesn't exist
          if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
          }
          
          // Format log entry
          const time = DateTime ? DateTime.now().setZone(timezone).toISO() : new Date().toISOString();
          let logMessage;
          
          if (typeof data === 'object') {
            logMessage = JSON.stringify({
              level,
              time,
              ...data
            }) + '\n';
          } else {
            logMessage = JSON.stringify({
              level,
              time,
              message: data
            }) + '\n';
          }
          
          // Append to log file
          fs.appendFileSync(logFile, logMessage);
        } catch (error) {
          console.error('Failed to write to log file:', error);
        }
      }
    }
  } catch (error) {
    // Fallback if logging completely fails
    console.error('Logging error:', error, 'Original data:', data);
  }
}