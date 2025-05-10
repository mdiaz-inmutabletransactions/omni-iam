// app/core/config/environment.server.ts
// This module loads raw environment variables with basic defaults
// Server-side version with Node.js imports
import { promises as fsPromises } from 'fs';
import * as fs from 'fs';
import path from 'path';
import { DateTime } from 'luxon';
import * as os from 'os'; // Import os module for hostname

// Helper to get the system hostname
function getSystemHostname(): string {
  try {
    // In Node.js environment, use the os module to get the hostname
    if (typeof process !== 'undefined' && process.versions && process.versions.node) {
      return os.hostname();
    }
    
    // Fallback to environment variable
    const envHostname = process.env.HOSTNAME || process.env.COMPUTERNAME;
    if (envHostname) {
      return envHostname;
    }
    
    // Final fallback
    return process.env.NODE_ENV === 'production' ? 'server' : 'localhost';
  } catch (error) {
    // If anything fails, return a default value
    return process.env.NODE_ENV === 'production' ? 'server' : 'localhost';
  }
}

// Cache the hostname so we don't recalculate it for every log
const systemHostname = getSystemHostname();

// Load environment variables directly from process.env
function loadRawEnv() {
  const env: Record<string, string | undefined> = {};
  
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
  TIMEZONE: 'America/Mexico_City',
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
  return targets ? targets.split(',').map(t => t.trim()) : ['console'];
}

// Helper to convert string log level to pino level
function getLogLevel(): string {
  return getEnv('LOG_LEVEL', logDefaults.LOG_LEVEL) || 'info';
}

// Get the log file path
function getLogFilePath(): string {
  return getEnv('LOG_FILE_PATH', logDefaults.LOG_FILE_PATH) || './logs';
}

// Get the timezone
function getTimezone(): string {
  return getEnv('TIMEZONE', logDefaults.TIMEZONE) || 'UTC';
}

// Helper to convert log level to Pino numeric level
function levelToNumber(level: string): number {
  switch (level.toLowerCase()) {
    case 'trace': return 10;
    case 'debug': return 20;
    case 'info': return 30;
    case 'warn': return 40;
    case 'error': return 50;
    case 'fatal': return 60;
    default: return 30; // default to info
  }
}

// Helper to convert log level to Pino numeric level
/*function mapOtelSevery(level: string | number): string | number {

  if (level istypeof string)
  switch (level.toLowerCase()) {
    case 'trace': return 10;
    case 'debug': return 20;
    case 'info': return 30;
    case 'warn': return 40;
    case 'error': return 50;
    case 'fatal': return 60;
    default: return 30; // default to info
  }
}*/

// Create log directories if needed
async function ensureLogDirectory(dirPath: string): Promise<void> {
  try {
    await fsPromises.mkdir(dirPath, { recursive: true });
  } catch (error) {
    console.error('Failed to create log directory:', error);
  }
}

// Ensure log directory exists (synchronous version for initialization)
function ensureLogDirectorySync(dirPath: string): void {
  try {
    if (typeof fs.existsSync === 'function' && !fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  } catch (error) {
    console.error('Failed to create log directory:', error);
  }
}

// Custom log formatter with string parsing to object
function formatLogEntry(level: string, data: any): string {
  const time = DateTime ? DateTime.now().setZone(getTimezone()).toISO() : new Date().toISOString();
  
  // Create an object that matches Pino's format exactly
  const logObject: Record<string, any> = {
    level: level.toLowerCase(),
    time,
    pid: process.pid,
    hostname: systemHostname // Use the cached hostname
  };
  
  // Add all properties from data directly to the log object
  if (typeof data === 'object' && data !== null) {
    Object.assign(logObject, data);
  } else if (typeof data === 'string') {
    // Use direct message field instead of msg
    logObject.message = data;
  }
  
  return JSON.stringify(logObject) + '\n';
}

// Configure and create lightweight Pino loggers
const targets = getLogTargets();
const logLevel = getLogLevel();
const logFormat = getEnv('LOG_FORMAT', logDefaults.LOG_FORMAT);

// Initialize loggers based on targets
let consoleLogger: any = null;
let logDir: string | null = null;
let logFile: string | null = null;

// Setup console logger if needed
if (targets.includes('console')) {
  try {
    // For browsers or environments without pino
    consoleLogger = {
      trace: (data: any) => console.trace(data),
      debug: (data: any) => console.debug(data),
      info: (data: any) => console.info(data),
      warn: (data: any) => console.warn(data),
      error: (data: any) => console.error(data),
      fatal: (data: any) => console.error(data)
    };
  } catch (error) {
    console.error('Failed to initialize console logger:', error);
  }
}

// Setup file path if needed
if (targets.includes('file') && typeof process !== 'undefined') {
  try {
    logDir = getLogFilePath();
    
    // Create directory if needed (sync during initialization)
    if (typeof fs.existsSync === 'function') {
      ensureLogDirectorySync(logDir);
    }
    
    logFile = path.join(logDir, 'app.log');
  } catch (error) {
    console.error('Failed to setup log file path:', error);
  }
}

// Improved safeLog that works with ES modules
export function safeLog(level: string, data: any, ...args: any[]): void {
  // For console logging
  if (targets.includes('console') && consoleLogger) {
    switch (level) {
      case 'trace': consoleLogger.trace(data, ...args); break;
      case 'debug': consoleLogger.debug(data, ...args); break;
      case 'info': consoleLogger.info(data, ...args); break;
      case 'warn': consoleLogger.warn(data, ...args); break;
      case 'error': consoleLogger.error(data, ...args); break;
      case 'fatal': consoleLogger.fatal(data, ...args); break;
      default: consoleLogger.info(data, ...args);
    }
  } else if (targets.includes('console')) {
    // Fallback to regular console if logger not available
    console.log(data, ...args);
  }
  
  // For file logging, write directly in the correct format
  if (targets.includes('file') && logFile && logDir) {
    try {
      const logEntry = formatLogEntry(level, data);
      
      // Use fs.appendFileSync since we're in ESM environment
      fs.appendFileSync(logFile, logEntry);
    } catch (error) {
      console.error('Failed to write to log file:', error);
      console.error(error);
    }
  }
  
  // For OpenTelemetry, just a placeholder for now
  if (targets.includes('opentelemetry') && getBoolEnv('OTEL_ENABLED', false)) {
    // Placeholder for OpenTelemetry integration
  }
}

// Initialize log directories during module load
if (logDir && typeof fs.existsSync === 'function') {
  ensureLogDirectorySync(logDir);
}