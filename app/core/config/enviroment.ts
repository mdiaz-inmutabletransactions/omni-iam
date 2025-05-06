// app/core/config/environment.ts
// This module loads raw environment variables with basic defaults
// Both ViteEnv and LogManager can import from this
import fs from 'fs';
import path from 'path';

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

// Get log targets from environment or defaults
function getLogTargets(): string[] {
  const targets = getEnv('LOG_TARGETS', logDefaults.LOG_TARGETS);
  return targets.split(',').map(t => t.trim());
}

// Helper function to ensure log directory exists
function ensureLogDirectory(): string {
  const logDir = getEnv('LOG_FILE_PATH', logDefaults.LOG_FILE_PATH) || './logs';
  
  // Only try to create directory if we're in a Node.js environment
  if (typeof process !== 'undefined' && fs && fs.existsSync) {
    if (!fs.existsSync(logDir)) {
      try {
        fs.mkdirSync(logDir, { recursive: true });
      } catch (error) {
        console.error(`Failed to create log directory: ${logDir}`, error);
      }
    }
  }
  
  return logDir;
}

// Safely handle OpenTelemetry functionality
let otelLogger: any = null;
function initOtelLogger() {
  // Only initialize if otel is in the targets and we have the deps
  if (getLogTargets().includes('opentelemetry') && getBoolEnv('OTEL_ENABLED', false)) {
    try {
      // Try to dynamically import the OpenTelemetry logger
      // This is a basic placeholder - the actual OpenTelemetry integration
      // would be more complex and may require async initialization
      otelLogger = {
        log: (level: string, message: any) => {
          // Placeholder for actual OTel logging
          console.log(`[OTel] ${level.toUpperCase()}: `, message);
        }
      };
    } catch (error) {
      console.error('Failed to initialize OpenTelemetry logger', error);
    }
  }
}

// Improved safeLog that respects LOG_TARGETS
export function safeLog(level: string, msg: string | object, ...args: any[]): void {
  const logTargets = getLogTargets();
  const logObj = typeof msg === 'string' ? { msg } : msg;
  
  // Add timestamp if configured
  if (getBoolEnv('LOG_INCLUDE_TIMESTAMP', true)) {
    logObj.timestamp = new Date().toISOString();
  }
  
  // Add level to object
  logObj.level = level;
  
  // Console logging
  if (logTargets.includes('console')) {
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
  
  // File logging
  if (logTargets.includes('file')) {
    try {
      const logDir = ensureLogDirectory();
      const logFormat = getEnv('LOG_FORMAT', logDefaults.LOG_FORMAT);
      
      // Only attempt file logging in Node environment
      if (typeof process !== 'undefined' && fs && fs.appendFileSync) {
        const logFilePath = path.join(logDir, `app.log`);
        const logEntry = logFormat === 'json' 
          ? JSON.stringify(logObj) + '\n'
          : `[${new Date().toISOString()}] ${level.toUpperCase()}: ${
              typeof msg === 'string' ? msg : JSON.stringify(msg)
            }\n`;
        
        fs.appendFileSync(logFilePath, logEntry);
      }
    } catch (error) {
      // Fall back to console if file logging fails
      console.error('Failed to write to log file:', error);
    }
  }
  
  // OpenTelemetry logging
  if (logTargets.includes('opentelemetry')) {
    if (!otelLogger) {
      initOtelLogger();
    }
    
    if (otelLogger) {
      // This is a placeholder for actual OTel integration
      otelLogger.log(level, logObj);
    }
  }
}

// Initialize any required dependencies
(function init() {
  // Ensure log directory exists if file logging is enabled
  if (getLogTargets().includes('file')) {
    ensureLogDirectory();
  }
  
  // Initialize OpenTelemetry logger if needed
  if (getLogTargets().includes('opentelemetry')) {
    initOtelLogger();
  }
})();