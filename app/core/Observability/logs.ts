// app/core/Observability/logs.ts

// Detect if we're in a Node.js environment
const isNodeEnvironment = typeof process !== 'undefined' && 
                          process.versions != null && 
                          process.versions.node != null;

import { pino, LoggerOptions, TransportTargetOptions } from 'pino';

// Import from the config module
import { 
  getEnv, 
  getBoolEnv,
  getNumEnv, 
  logDefaults,
  safeLog,
} from '../config/enviroment';

// For OpenTelemetry trace context propagation
import { DateTime } from 'luxon';

// Define log levels as a union type
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

// Define log targets as a union type
export type LogTarget = 'console' | 'file' | 'opentelemetry';

// Define log formats
export type LogFormat = 'json' | 'pretty';

/**
 * Complete mapping of OpenTelemetry severity levels
 * Based on OpenTelemetry specification with all 24 levels
 */

// Type definitions
export type OtelSeverityText = 
  | 'TRACE' | 'TRACE2' | 'TRACE3' | 'TRACE4'
  | 'DEBUG' | 'DEBUG2' | 'DEBUG3' | 'DEBUG4'
  | 'INFO' | 'INFO2' | 'INFO3' | 'INFO4'
  | 'WARN' | 'WARN2' | 'WARN3' | 'WARN4'
  | 'ERROR' | 'ERROR2' | 'ERROR3' | 'ERROR4'
  | 'FATAL' | 'FATAL2' | 'FATAL3' | 'FATAL4';

  export type OtelSeverityNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24;

// Complete severity mapping tables
const SEVERITY_TEXT_TO_NUMBER: Record<string, number> = {
  'TRACE': 1,   'TRACE2': 2,  'TRACE3': 3,  'TRACE4': 4,
  'DEBUG': 5,   'DEBUG2': 6,  'DEBUG3': 7,  'DEBUG4': 8,
  'INFO': 9,    'INFO2': 10,  'INFO3': 11,  'INFO4': 12,
  'WARN': 13,   'WARN2': 14,  'WARN3': 15,  'WARN4': 16,
  'ERROR': 17,  'ERROR2': 18, 'ERROR3': 19, 'ERROR4': 20,
  'FATAL': 21,  'FATAL2': 22, 'FATAL3': 23, 'FATAL4': 24
};

const SEVERITY_NUMBER_TO_TEXT: Record<number, string> = {
  1: 'TRACE',   2: 'TRACE2',  3: 'TRACE3',  4: 'TRACE4',
  5: 'DEBUG',   6: 'DEBUG2',  7: 'DEBUG3',  8: 'DEBUG4',
  9: 'INFO',    10: 'INFO2',  11: 'INFO3',  12: 'INFO4',
  13: 'WARN',   14: 'WARN2',  15: 'WARN3',  16: 'WARN4',
  17: 'ERROR',  18: 'ERROR2', 19: 'ERROR3', 20: 'ERROR4',
  21: 'FATAL',  22: 'FATAL2', 23: 'FATAL3', 24: 'FATAL4'
};

/**
 * Maps OpenTelemetry severity text to severity number (all 24 levels)
 * 
 * @param severityText - The severity level as text (e.g., 'ERROR', 'WARN2', 'INFO3')
 * @returns The corresponding severity number according to OpenTelemetry specification
 */
export function severityTextToNumber(severityText: string): number {
  const textUpper = severityText.toUpperCase();
  const severityNumber = SEVERITY_TEXT_TO_NUMBER[textUpper];
  
  if (severityNumber !== undefined) {
    return severityNumber;
  }
  
  // If exact match not found, try to parse variants
  // Handle cases like 'trace_2', 'debug-3', etc.
  const match = textUpper.match(/^(TRACE|DEBUG|INFO|WARN|ERROR|FATAL)[\s_-]?(\d)?$/);
  if (match) {
    const [, level, number] = match;
    const sublevel = number ? parseInt(number, 10) : 1;
    if (sublevel >= 1 && sublevel <= 4) {
      const key = sublevel === 1 ? level : `${level}${sublevel}`;
      return SEVERITY_TEXT_TO_NUMBER[key] || 9; // Default to INFO
    }
  }
  
  // Default to INFO level
  return 9;
}

/**
 * Maps OpenTelemetry severity number to severity text (all 24 levels)
 * 
 * @param severityNumber - The severity level as number (1-24)
 * @returns The corresponding severity text according to OpenTelemetry specification
 */
export function severityNumberToText(severityNumber: number): string {
  const severityText = SEVERITY_NUMBER_TO_TEXT[severityNumber];
  
  if (severityText !== undefined) {
    return severityText;
  }
  
  // If number is outside 1-24 range, return INFO as default
  return 'INFO';
}

/**
 * Gets both severity text and number from either input type
 * 
 * @param severity - Either severity text or number
 * @returns An object containing both severity text and number
 */
export function getSeverityInfo(severity: string | number): {
  severityText: string;
  severityNumber: number;
} {
  if (typeof severity === 'string') {
    const severityNumber = severityTextToNumber(severity);
    return {
      severityText: severityNumberToText(severityNumber),
      severityNumber
    };
  } else {
    const severityText = severityNumberToText(severity);
    return {
      severityText,
      severityNumber: severity
    };
  }
}

/**
 * Validates if a severity number is within the valid OpenTelemetry range (1-24)
 * 
 * @param severityNumber - The severity number to validate
 * @returns boolean indicating if the severity number is valid
 */
export function isValidSeverityNumber(severityNumber: number): boolean {
  return severityNumber >= 1 && severityNumber <= 24;
}

/**
 * Validates if a severity text is a valid OpenTelemetry severity level
 * 
 * @param severityText - The severity text to validate
 * @returns boolean indicating if the severity text is valid
 */
export function isValidSeverityText(severityText: string): boolean {
  return SEVERITY_TEXT_TO_NUMBER[severityText.toUpperCase()] !== undefined;
}

/**
 * Gets the base severity level (without sub-level) from any severity text
 * 
 * @param severityText - The severity level as text (e.g., 'ERROR3' -> 'ERROR')
 * @returns The base severity level
 */
export function getBaseSeverityLevel(severityText: string): string {
  const textUpper = severityText.toUpperCase();
  const match = textUpper.match(/^(TRACE|DEBUG|INFO|WARN|ERROR|FATAL)/);
  return match ? match[1] : 'INFO';
}

/**
 * Gets the severity sub-level from severity text
 * 
 * @param severityText - The severity level as text (e.g., 'ERROR3' -> 3)
 * @returns The sub-level number (1-4), or 1 if no sub-level specified
 */
export function getSeveritySubLevel(severityText: string): number {
  const textUpper = severityText.toUpperCase();
  const match = textUpper.match(/^(?:TRACE|DEBUG|INFO|WARN|ERROR|FATAL)(\d)?$/);
  
  if (match && match[1]) {
    const sublevel = parseInt(match[1], 10);
    return sublevel >= 1 && sublevel <= 4 ? sublevel : 1;
  }
  
  return 1;
}

/**
 * Constructs severity text from base level and sub-level
 * 
 * @param baseLevel - The base severity level (e.g., 'ERROR')
 * @param subLevel - The sub-level (1-4)
 * @returns The constructed severity text (e.g., 'ERROR3')
 */
export function constructSeverityText(baseLevel: string, subLevel: number = 1): string {
  const validBaseLevels = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];
  const normalizedBase = baseLevel.toUpperCase();
  
  if (!validBaseLevels.includes(normalizedBase)) {
    throw new Error(`Invalid base level: ${baseLevel}`);
  }
  
  if (subLevel < 1 || subLevel > 4) {
    throw new Error(`Invalid sub-level: ${subLevel}. Must be between 1 and 4.`);
  }
  
  return subLevel === 1 ? normalizedBase : `${normalizedBase}${subLevel}`;
}

/**
 * Gets all valid severity texts
 * 
 * @returns Array of all valid severity text values
 */
export function getAllSeverityTexts(): string[] {
  return Object.keys(SEVERITY_TEXT_TO_NUMBER);
}

/**
 * Gets all valid severity numbers
 * 
 * @returns Array of all valid severity number values
 */
export function getAllSeverityNumbers(): number[] {
  return Object.keys(SEVERITY_NUMBER_TO_TEXT).map(Number);
}

/**
 * Converts a severity level to a consistent format
 * This is useful for normalizing various input formats to standard OpenTelemetry format
 * 
 * @param input - Any severity representation (string or number)
 * @returns Normalized severity information
 */
export function normalizeSeverity(input: string | number): {
  text: string;
  number: number;
  baseLevel: string;
  subLevel: number;
} {
  const { severityText, severityNumber } = getSeverityInfo(input);
  const baseLevel = getBaseSeverityLevel(severityText);
  const subLevel = getSeveritySubLevel(severityText);
  
  return {
    text: severityText,
    number: severityNumber,
    baseLevel,
    subLevel
  };
}


// Global trace context store to maintain consistency across logger instances
const TRACE_CONTEXT_STORE = {
  traceId: '',
  spanId: '',
  traceFlags: 1,
  initialized: false
};


// Define RedactOptions interface
interface RedactOptions {
  paths: string[];
  remove?: boolean;
  censor?: string;
}

// OpenTelemetry Log and Event Record definition
// https://opentelemetry.io/docs/specs/otel/logs/data-model/#log-and-event-record-definition
export interface  OtelLogRecord  {
  // Timestamp (ISO8601-compatible string in nanoseconds)
  Timestamp: string;
  ObservedTime?: string;
  TraceId: string;
  SpanId: string;
  TraceFlags: number;
  SeverityText?: string;
  SeverityNumber: number;
  Body?: string | Record<string, any>;
  Resource: Record<string, any>;
  Attributes?: Record<string, any>;
  InstrumentationScope?: string | Record<string, any>;
  // Legacy fields for backward compatibility
  [key: string]: any;
}

// Schema for log configuration with exact types
export interface LogSchema {
  LOG_LEVEL: LogLevel;
  LOG_TARGETS: LogTarget[];
  LOG_FILE_PATH?: string;
  LOG_FILE_ROTATION?: boolean;
  LOG_MAX_SIZE?: number;
  LOG_FORMAT: LogFormat;
  LOG_INCLUDE_TIMESTAMP: boolean;
  LOG_INCLUDE_HOSTNAME: boolean;
  CORRELATION_ID_HEADER: string;
  REDACT_FIELDS: string[];
}

// Extended logger interface that includes OpenTelemetry methods
export interface LoggerInstance {
  trace: (data: string | OtelLogRecord | any, attrs?: Record<string, any>) => void;
  debug: (data: string | OtelLogRecord | any, attrs?: Record<string, any>) => void;
  info: (data: string | OtelLogRecord | any, attrs?: Record<string, any>) => void;
  warn: (data: string | OtelLogRecord | any, attrs?: Record<string, any>) => void;
  error: (data: string | OtelLogRecord | any, attrs?: Record<string, any>) => void;
  fatal: (data: string | OtelLogRecord | any, attrs?: Record<string, any>) => void;
  child: (context: LogContext) => LoggerInstance;
  event: (name: string, data?: Record<string, any>) => void;
  metric: (name: string, value: number, attributes?: Record<string, any>) => void;
  flush?: () => void;
  [key: string]: any;
}

// Type for logging context
export interface LogContext {
  [key: string]: string | number | boolean | object | null | undefined;
}

// Utility to get W3C trace context from environment or parent spans
export function getTraceContext(): { TraceId?: string, SpanId?: string, TraceFlags?: number } {
  
  if (TRACE_CONTEXT_STORE.initialized && TRACE_CONTEXT_STORE.traceId) {
    return {
      TraceId: TRACE_CONTEXT_STORE.traceId,
      SpanId: TRACE_CONTEXT_STORE.spanId,
      TraceFlags: TRACE_CONTEXT_STORE.traceFlags
    };
  }
  
  // Check if we have a parent trace context (from environment, headers, etc.)
  const traceparent = typeof process !== 'undefined' ? process.env.TRACEPARENT : undefined;
  
  if (traceparent) {
    try {
      // Parse W3C trace context format: 00-traceId-spanId-traceFlags
      // https://www.w3.org/TR/trace-context/#traceparent-header
      const parts = traceparent.split('-');
      if (parts.length === 4) {

        TRACE_CONTEXT_STORE.traceId = parts[1];
        TRACE_CONTEXT_STORE.spanId = parts[2];
        TRACE_CONTEXT_STORE.traceFlags = parseInt(parts[3], 16);
        TRACE_CONTEXT_STORE.initialized = true;

        return {
          TraceId: TRACE_CONTEXT_STORE.traceId,
          SpanId: TRACE_CONTEXT_STORE.spanId,
          TraceFlags: TRACE_CONTEXT_STORE.traceFlags
        };
      }
    } catch (e) {
      // If parsing fails, generate a new trace context
      console.error('Failed to parse trace context:', e);
    }
  }
  

  if (!TRACE_CONTEXT_STORE.initialized) {
    TRACE_CONTEXT_STORE.traceId = randomHex(32).toLowerCase();
    TRACE_CONTEXT_STORE.spanId = randomHex(16).toLowerCase();
    TRACE_CONTEXT_STORE.traceFlags = 1;
    TRACE_CONTEXT_STORE.initialized = true;
  }
  
  return {
    TraceId: TRACE_CONTEXT_STORE.traceId,
    SpanId: TRACE_CONTEXT_STORE.spanId,
    TraceFlags: TRACE_CONTEXT_STORE.traceFlags
  };
}

// Add a function to set the trace context from outside
export function setTraceContext(traceId?: string, spanId?: string, traceFlags?: number): void {
  if (traceId) {
    TRACE_CONTEXT_STORE.traceId = traceId;
    TRACE_CONTEXT_STORE.initialized = true;
  }
  if (spanId) {
    TRACE_CONTEXT_STORE.spanId = spanId;
  }
  if (traceFlags !== undefined) {
    TRACE_CONTEXT_STORE.traceFlags = traceFlags;
  }
}

// Create a function to generate a new span ID while keeping the same trace ID
export function createNewSpan(): { SpanId: string, ParentSpanId: string } {
  const currentSpanId = TRACE_CONTEXT_STORE.spanId;
  const newSpanId = randomHex(16).toLowerCase();
  TRACE_CONTEXT_STORE.spanId = newSpanId;
  return {
    SpanId: newSpanId,
    ParentSpanId: currentSpanId
  };
}

// Generate random hex string for trace/span IDs
function randomHex(length: number): string {
  const bytes = new Uint8Array(length / 2);
  
  if (isNodeEnvironment) {
    // Node.js environment - use crypto with ESM import
    try {
      // Use the Web Crypto API which is available in both Node.js and browsers
      // For older Node.js versions, this falls back to the crypto module
      crypto.getRandomValues(bytes);
    } catch (e) {
      // Fallback for older Node.js versions that don't support crypto.getRandomValues
      // We use a dynamic import to handle this case since it's rare
      import('node:crypto').then(nodeCrypto => {
        nodeCrypto.randomFillSync(bytes);
      }).catch(() => {
        console.error('Failed to import crypto module for random generation');
      });
    }
  } else {
    // Browser environment - use Web Crypto API
    crypto.getRandomValues(bytes);
  }
  
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Get system resource information for logs
function getResourceInfo(): Record<string, any> {
  const resourceInfo: Record<string, any> = {
    'service.name': getEnv('OTEL_SERVICE_NAME', 'unknown_service'),
    'service.version': getEnv('OTEL_SERVICE_VERSION', '0.0.0'),
    'service.instance.id': getEnv('HOSTNAME', 'unknown_instance'),
    'environment': getEnv('VITE_PUBLIC_ENV', 'development')
  };
  
  if (isNodeEnvironment) {
    try {
      // Use dynamic import for OS module
      import('node:os').then(osModule => {
        resourceInfo['host.name'] = osModule.hostname();
        resourceInfo['host.arch'] = osModule.arch();
        resourceInfo['host.type'] = osModule.type();
        resourceInfo['process.pid'] = process.pid;
        resourceInfo['process.runtime.name'] = 'node';
        resourceInfo['process.runtime.version'] = process.version;
      }).catch(e => {
        // Silently fail if the module can't be imported
        console.warn('Failed to import os module for resource info');
      });
    } catch (e) {
      // Ignore errors in resource detection
    }
  } else {
    // Browser-specific resource information
    if (typeof navigator !== 'undefined') {
      resourceInfo['browser.user_agent'] = navigator.userAgent;
      resourceInfo['browser.language'] = navigator.language;
      resourceInfo['browser.platform'] = navigator.platform;
    }
  }
  
  return resourceInfo;
}

// Map severity text to OTel severity number
// https://opentelemetry.io/docs/specs/otel/logs/data-model/#field-severitynumber
// TODO: Duplicated with  severityText ...
function getSeverityNumber(level: string): number {
  switch (level.toLowerCase()) {
    case 'trace': return 1;
    case 'debug': return 5;
    case 'info': return 9;
    case 'warn': return 13;
    case 'error': return 17;
    case 'fatal': return 21;
    default: return 9; // default to INFO
  }
}

// Simple console logger for browser environments or before Pino is loaded
function createConsoleLogger(): LoggerInstance {
  const resource = getResourceInfo();
  const baseContext: LogContext = {};
  
  function logWithContext(level: string, data: any, additionalAttrs?: Record<string, any>): void {
    //TODO: corregir fecha si null or undefined en todo el proyecto o refactorizar
    const timestamp = DateTime.now().setZone(logTimeZone).toISO() || DateTime.now().toLocal().toString();
    const traceContext = getTraceContext();
    const severityNumber = getSeverityNumber(level);

    // Create OpenTelemetry-compatible log record
    let logRecord: OtelLogRecord = {
      Timestamp: timestamp,
      TraceId: traceContext.TraceId || randomHex(32).toLowerCase(), //TODO: || add this?  "00000000000000000000000000000000" ??? https://www.w3.org/TR/trace-context/#trace-id
      SpanId: traceContext.SpanId || randomHex(16).toLowerCase(), //TODO: || "0000000000000000" ???
      TraceFlags: traceContext.TraceFlags || 1,
      SeverityNumber: severityNumber,
      SeverityText: level,
      Body: data,
      Attributes: { ...baseContext, ...additionalAttrs },
      Resource:resource,
      //...traceContext
    };
    
    if (typeof data === 'string') {
      // Convert string message to log record
      logRecord = {
        Timestamp: timestamp,
        TraceId: traceContext.TraceId || randomHex(32).toLowerCase(),
        SpanId: traceContext.SpanId || randomHex(16).toLowerCase(),
        TraceFlags: traceContext.TraceFlags || 1,
        SeverityNumber: severityNumber,
        SeverityText: level,
        Body: data,
        Attributes: { ...baseContext, ...additionalAttrs },
        Resource:resource,
        //...traceContext
      };
    } else if (data && typeof data === 'object') {
      // Check if it's already a log record
      if ('Body' in data || 'SeverityNumber' in data) {
        // It's already a log record, just supplement it
        logRecord = {
          Timestamp: data.Timestamp || timestamp,
          TraceId: data.TraceID || traceContext.TraceId || randomHex(32).toLowerCase(),
          SpanId: data.SpanID || traceContext.SpanId || randomHex(16).toLowerCase(),
          TraceFlags: data.TraceFlags || traceContext.TraceFlags || 1,
          SeverityNumber: data.SeverityNumber || severityNumber,
          SeverityText: data.SeverityText || level,
          Attributes: { ...baseContext, ...(data.Attributes || {}), ...(additionalAttrs || {}) },
          Resource: { ...resource, ...(data.resource || {}) },
          ...data //TODO: Clean contex from data for avoid creating duplicated context i.e. function ridContexFromData( ...)
          //...traceContext
        };
      } else {
        // It's just a data object, use it as the body
        logRecord = {
          Timestamp: timestamp,
          TraceId: traceContext.TraceId || randomHex(32).toLowerCase(),
          SpanId: traceContext.SpanId || randomHex(16).toLowerCase(),
          TraceFlags: traceContext.TraceFlags || 1,
          SeverityNumber: severityNumber,
          SeverityText: level,
          Body: data,
          Attributes: { ...baseContext, ...additionalAttrs },
          Resource:resource,
          //...traceContext
        };
      }
    } else {
      // Fallback for other data types
      logRecord = {

        Timestamp: timestamp,
        TraceId: traceContext.TraceId || randomHex(32).toLowerCase(),
        SpanId: traceContext.SpanId || randomHex(16).toLowerCase(),
        TraceFlags: traceContext.TraceFlags || 1,
        SeverityNumber: severityNumber,
        SeverityText: level,
        Body: String(data),
        Attributes: { ...baseContext, ...additionalAttrs },
        Resource:resource,
        //...traceContext
      };
    }
    
    // Gets both text and number from level information based on Otel Levels
    // https://opentelemetry.io/docs/specs/otel/logs/data-model/#displaying-severity
    // TODO: refactor to higer level like trace context
    const severityInfo = getSeverityInfo(level);

    // For console output, try to make it readable
    const consoleOutput = {
        Timestamp: timestamp,
        TraceId: traceContext.TraceId || randomHex(32).toLowerCase(),
        SpanId: traceContext.SpanId || randomHex(16).toLowerCase(),
        TraceFlags: traceContext.TraceFlags || 1,
        SeverityNumber: severityInfo.severityNumber,
        SeverityText: severityInfo.severityText,
      ...(typeof logRecord.Body === 'string' 
        ? { Body: logRecord.Body } 
        : { ...(Object.keys(logRecord.Body || {}).length > 0 ? { Body: logRecord.Body } : {}) }),
      ...(Object.keys(logRecord.Attributes || {}).length > 0 ? { Attributes: logRecord.Attributes } : {}),
      ...(Object.keys(logRecord.Resource || {}).length > 0 ? { Resource: logRecord.Resource } : {})
    };
    
    // Log to console
    switch (level) {
      case 'trace': console.trace(consoleOutput); break;
      case 'debug': console.debug(consoleOutput); break;
      case 'info': console.info(consoleOutput); break;
      case 'warn': console.warn(consoleOutput); break;
      case 'error': console.error(consoleOutput); break;
      case 'fatal': console.error(consoleOutput); break;
      default: console.log(consoleOutput);
    }
  }
  
  // Create logger instance with OpenTelemetry support
  const logger: LoggerInstance = {
    trace: (data, attrs) => { logWithContext('trace', data, attrs); return true; },
    debug: (data, attrs) => { logWithContext('debug', data, attrs); return true; },
    info: (data, attrs) => { logWithContext('info', data, attrs); return true; },
    warn: (data, attrs) => { logWithContext('warn', data, attrs); return true; },
    error: (data, attrs) => { logWithContext('error', data, attrs); return true; },
    fatal: (data, attrs) => { logWithContext('fatal', data, attrs); return true; },
    event: (name, data = {}) => { 
      logWithContext('info', { 
        ...data,
        'event.name': name,
        'event.domain': data.domain || 'app'
      });
      return true;
    },
    metric: (name, value, attributes = {}) => {
      logWithContext('info', {
        'metric.name': name,
        'metric.value': value,
        ...attributes
      });
      return true;
    },
    
    // Create child logger with additional context
    child: (context: LogContext) => {
      // Create a new logger with combined context
      const childLogger = createConsoleLogger();
      // Update the base context
      Object.assign(baseContext, context);
      return childLogger;
    },
    
    // Flush logs (no-op for console)
    flush: () => {}
  };
  
  return logger;
}

// Get configuration
const logLevel = getEnv('LOG_LEVEL', logDefaults.LOG_LEVEL) || 'info';
const logTargetsStr = getEnv('LOG_TARGETS', logDefaults.LOG_TARGETS);
const logTargets = logTargetsStr ? logTargetsStr.split(',').map(t => t.trim()) : ['console'];
const logFilePath = getEnv('LOG_FILE_PATH', logDefaults.LOG_FILE_PATH) || './logs';
const logFormat = getEnv('LOG_FORMAT', logDefaults.LOG_FORMAT) || 'json';
const logTimeZone = getEnv('TIMEZONE', logDefaults.TIMEZONE);

console.log(`Initializing logger with targets: ${logTargets.join(', ')}, format: ${logFormat}, path: ${logFilePath}`);

// Create a global logger instance that we'll export
// Start with a console logger that will be available immediately
const logger: LoggerInstance = createConsoleLogger();

// We need to set up file logging if necessary
if (isNodeEnvironment && logTargets.includes('file')) {
  // When in Node.js and file logging is requested, set it up immediately
  try {
    // Call the function to get the transport configuration
    const transportConfig = createPinoConfig(logTargets, logLevel, logFilePath);

    // Create file logger
    const Logger = pino(transportConfig);

    // Update the global logger methods to log to both destinations
    const originalTrace = logger.trace;
    const originalDebug = logger.debug;
    const originalInfo = logger.info;
    const originalWarn = logger.warn;
    const originalError = logger.error;
    const originalFatal = logger.fatal;
    const originalEvent = logger.event;
    const originalMetric = logger.metric;

    // Override methods to log to both
    logger.trace = (data: any, attrs?: Record<string, any>) => {
      Logger.trace(formatOtelLogRecord('trace', data, attrs));
      originalTrace(data, attrs);
      return true;
    };

    logger.debug = (data: any, attrs?: Record<string, any>) => {
      Logger.debug(formatOtelLogRecord('debug', data, attrs));
      originalDebug(data, attrs);
      return true;
    };

    logger.info = (data: any, attrs?: Record<string, any>) => {
      Logger.info(formatOtelLogRecord('info', data, attrs));
      originalInfo(data, attrs);
      return true;
    };

    logger.warn = (data: any, attrs?: Record<string, any>) => {
      Logger.warn(formatOtelLogRecord('warn', data, attrs));
      originalWarn(data, attrs);
      return true;
    };

    logger.error = (data: any, attrs?: Record<string, any>) => {
      Logger.error(formatOtelLogRecord('error', data, attrs));
      originalError(data, attrs);
      return true;
    };

    logger.fatal = (data: any, attrs?: Record<string, any>) => {
      Logger.fatal(formatOtelLogRecord('fatal', data, attrs));
      originalFatal(data, attrs);
      return true;
    };
    
    // Override event and metric methods
    logger.event = (name: string, data: Record<string, any> = {}) => {
      Logger.info(formatOtelLogRecord('info', {
        ...data,
        'event.name': name,
        'event.domain': data.domain || 'app'
      }));
      originalEvent(name, data);
      return true;
    };
    
    logger.metric = (name: string, value: number, attributes: Record<string, any> = {}) => {
      Logger.info(formatOtelLogRecord('info', {
        'metric.name': name,
        'metric.value': value,
        ...attributes
      }));
      originalMetric(name, value, attributes);
      return true;
    };

    // Custom child logger factory
logger.child = (context: LogContext) => {
  // Create Pino child logger
  const pinoChild = Logger.child(context);
  
  // Instead of trying to use .child() on a bound function, create a new console logger
  // and update its context directly
  const consoleLogger = createConsoleLogger();
  
  // We can assign the context directly to this new console logger
  // This replaces the problematic line that was trying to call .child() on a bound function
  
  // Combine them
  return {
    trace: (data: any, attrs?: Record<string, any>) => {
      pinoChild.trace(formatOtelLogRecord('trace', data, attrs));
      consoleLogger.trace(data, attrs);
      return true;
    },
    debug: (data: any, attrs?: Record<string, any>) => {
      pinoChild.debug(formatOtelLogRecord('debug', data, attrs));
      consoleLogger.debug(data, attrs);
      return true;
    },
    info: (data: any, attrs?: Record<string, any>) => {
      pinoChild.info(formatOtelLogRecord('info', data, attrs));
      consoleLogger.info(data, attrs);
      return true;
    },
    warn: (data: any, attrs?: Record<string, any>) => {
      pinoChild.warn(formatOtelLogRecord('warn', data, attrs));
      consoleLogger.warn(data, attrs);
      return true;
    },
    error: (data: any, attrs?: Record<string, any>) => {
      pinoChild.error(formatOtelLogRecord('error', data, attrs));
      consoleLogger.error(data, attrs);
      return true;
    },
    fatal: (data: any, attrs?: Record<string, any>) => {
      pinoChild.fatal(formatOtelLogRecord('fatal', data, attrs));
      consoleLogger.fatal(data, attrs);
      return true;
    },
    event: (name: string, data: Record<string, any> = {}) => {
      pinoChild.info(formatOtelLogRecord('info', {
        ...data,
        'event.name': name,
        'event.domain': data.domain || 'app'
      }));
      consoleLogger.event(name, data);
      return true;
    },
    metric: (name: string, value: number, attributes: Record<string, any> = {}) => {
      pinoChild.info(formatOtelLogRecord('info', {
        'metric.name': name,
        'metric.value': value,
        ...attributes
      }));
      consoleLogger.metric(name, value, attributes);
      return true;
    },
    child: (nestedContext: LogContext) => {
      const combinedContext = { ...context, ...nestedContext };
      return logger.child(combinedContext);
    },
    flush: () => {
      if (pinoChild.flush) pinoChild.flush();
      if (consoleLogger.flush) consoleLogger.flush();
    }
  };
};

    // Add a flush method to ensure logs are written
    logger.flush = () => {
      if (Logger.flush) Logger.flush();
    };

    console.log('Dual logging configured successfully');

    // Ensure logs are flushed on exit
    process.on('beforeExit', () => {
      if (Logger.flush) Logger.flush();
    });

    // Test log to verify file logging is working
    Logger.info('File logging initialized successfully');
    Logger.flush();

  } catch (error) {
    console.error('Error during logger initialization:', error);
  }
}

// Format data as OpenTelemetry log record
function formatOtelLogRecord(level: string, data: any, attrs?: Record<string, any>): OtelLogRecord {
  const timestamp = DateTime.now().setZone(logTimeZone).toISO() || DateTime.now().toLocal().toString();;
  const traceContext = getTraceContext();
  const resource = getResourceInfo();
  const severityNumber = getSeverityNumber(level);
  
  // Create the base log record
  const baseRecord: OtelLogRecord = {

    Timestamp: timestamp,
    TraceId: traceContext.TraceId || randomHex(32).toLowerCase(),
    SpanId: traceContext.SpanId || randomHex(16).toLowerCase(),
    TraceFlags: traceContext.TraceFlags || 1,
    SeverityNumber: severityNumber,
    SeverityText: level,
    Body: data,
    Attributes: { ...attrs },
    Resource:resource,
    //...traceContext
  };
  
  // Handle different data types
  if (typeof data === 'string') {
    return {
      ...baseRecord,
      Body: data,
      Attributes: attrs || {}
    };
  } else if (data && typeof data === 'object') {
    // Check if it's already a log record
    if ('body' in data || 'severity_number' in data) {
      return { //TODO: corregit estoYAAAAAAAA!
        ...baseRecord,
        ...data,
        attributes: { ...(data.attributes || {}), ...(attrs || {}) }
      };
    } else {
      // Extract OTel-specific fields
      const { 
      // TODO: ojo aqui hay trace_id commentado
       //trace_id, span_id, trace_flags, 
        severity_number: dataSeverity, severity_text: dataLevel,
        ...rest 
      } = data;
      
      // Add trace context from data if provided
      // TODO: ojo aqui hay trace_id commentado
      //if (trace_id) baseRecord.TraceId = trace_id;
      //if (span_id) baseRecord.SpanId = span_id;
      //if (trace_flags) baseRecord.TraceFlags = trace_flags;
      
      // Add severity info from data if provided
      if (dataSeverity) baseRecord.SeverityNumber = dataSeverity;
      if (dataLevel) baseRecord.SeverityText = dataLevel;
      
      // Handle message field for backward compatibility
      if ('message' in rest && !('body' in rest)) {
        return {//TODO: corregit estoYAAAAAAAA!
          ...baseRecord,
          Body: rest.message,
          Attributes: { ...(rest as any), ...(attrs || {}) }
        };
      }
      
      // Handle body field
      if ('body' in rest) {
        return {//TODO: corregit estoYAAAAAAAA!
          ...baseRecord,
          Body: rest.body,
          Attributes: { ...(rest as any), ...(attrs || {}) }
        };
      }
      
      // Default: use entire object as body
      return {
        ...baseRecord,
        Body: rest,
        Attributes: attrs || {}
      };
    }
  } else {
    // For primitive values
    return {
      ...baseRecord,
      Body: String(data),
      Attributes: attrs || {}
    };
  }
}

// Export the logger
export { logger };

// Export helper functions for creating loggers
/*export function createContextLogger(context: LogContext = {}): LoggerInstance {
  // Generate a new request ID if not provided
  if (!context.requestId && !context.request_id) {
    // Use Web Crypto API's randomUUID which works in both modern browsers and Node.js
    context.requestId = crypto.randomUUID();
  }
  
  // Ensure request_id is set (for backward compatibility)
  if (context.requestId && !context.request_id) {
    context.request_id = context.requestId;
  }
  
  // Get trace context
  const traceContext = getTraceContext();
  
  // Add trace context if not already present
  if (traceContext.traceId && !context.trace_id) {
    context.trace_id = traceContext.traceId;
  }
  if (traceContext.spanId && !context.span_id) {
    context.span_id = traceContext.spanId;
  }
  if (traceContext.traceFlags !== undefined && !context.trace_flags) {
    context.trace_flags = traceContext.traceFlags;
  }
  
  // Create child logger with context (synchronously)
  return logger.child(context);
}*/

export function createContextLogger(context: LogContext = {}): LoggerInstance {
  // Extract existing trace context fields from the input context
  const {
    trace_id, span_id, parent_span_id, trace_flags,
    traceId, spanId, parentSpanId, traceFlags,
    trace_Id, span_Id, trace_Flags,
    ...restContext
  } = context;
  
  // Determine the effective trace context
  let effectiveTraceId = trace_id || traceId || trace_Id;
  let effectiveSpanId = span_id || spanId || span_Id;
  let effectiveParentSpanId = parent_span_id || parentSpanId;
  let effectiveTraceFlags = trace_flags || traceFlags || trace_Flags;
  
  // If trace context is provided in the input, use it to update the store
  if (effectiveTraceId) {
    // Convert to string to fix the type error
    setTraceContext(
      String(effectiveTraceId), 
      effectiveSpanId ? String(effectiveSpanId) : undefined,
      typeof effectiveTraceFlags === 'number' ? effectiveTraceFlags : undefined
    );
  }
  
  // Get the current trace context (from the store)
  const traceContext = getTraceContext();
  
  // Generate a request ID if not provided
  const requestId = context.requestId || context.request_id || crypto.randomUUID();
  
  // Create a new span if needed - using different variable names to avoid redeclaration
  let finalSpanId = effectiveSpanId;
  let finalParentSpanId = effectiveParentSpanId;
  
  if (!finalSpanId) {
    const span = createNewSpan();
    finalSpanId = span.SpanId;
    finalParentSpanId = span.ParentSpanId;
  }
  
  // Create the final context with standardized field names
  //TODO: corregit estoYAAAAAAAA!
  // TODO: parece que aqui est el span_id (contecto) que esta de mas
  const standardizedContext: LogContext = {
    ...restContext,
    requestId,
    request_id: requestId,
    // Use standardized OpenTelemetry field names (snake_case)
    //trace_id: traceContext.TraceId,
    //span_id: finalSpanId,
    //trace_flags: traceContext.TraceFlags
  };
  
  // Add parent span ID if available
  if (finalParentSpanId) {
    standardizedContext.parent_span_id = finalParentSpanId;
  }
  
  // Create child logger with standardized context
  return logger.child(standardizedContext);
}

// Component logger that follows OpenTelemetry conventions
export function createComponentLogger(
  componentName: string,
  additionalContext: LogContext = {}
): LoggerInstance {
  // Create context with OpenTelemetry semantic conventions
  const context: LogContext = {
    'component': componentName,
    'code.namespace': componentName,
    ...additionalContext
  };
  
  // Create logger with OpenTelemetry context
  return logger.child(context);
}

// Operation logger that follows OpenTelemetry conventions
export function createOperationLogger(
  operationName: string,
  requestId: string = crypto.randomUUID(), // Use Web Crypto API here
  additionalContext: LogContext = {}
): LoggerInstance {
  // Get trace context
  const traceContext = getTraceContext();
  
  // Create context with OpenTelemetry semantic conventions
  const context: LogContext = {
    'operation': operationName,
    'requestId': requestId,
    'request_id': requestId, // For backward compatibility
    'event.name': operationName,
    'code.function': operationName,
    ...traceContext,
    ...additionalContext
  };
  
  // Create logger with OpenTelemetry context
  return logger.child(context);
}

// Request logger with HTTP semantic conventions
export function createRequestLogger(
  request: Request,
  additionalContext: LogContext = {}
): LoggerInstance {
  const url = new URL(request.url);
  const requestId = request.headers.get('X-Request-ID') || crypto.randomUUID();
  
  // Extract trace context from headers if available
  const traceparent = request.headers.get('traceparent');
  let traceContext = {};
  
  if (traceparent) {
    try {
      // Parse W3C trace context format: 00-traceId-spanId-flags
      const parts = traceparent.split('-');
      if (parts.length === 4) {
        traceContext = {
          trace_id: parts[1],
          span_id: parts[2],
          trace_flags: parseInt(parts[3], 16)
        };
      }
    } catch (e) {
      // If parsing fails, use the default trace context
      traceContext = getTraceContext();
    }
  } else {
    // No trace context in headers, use default
    traceContext = getTraceContext();
  }
  
  // Create context with HTTP semantic conventions
  // https://opentelemetry.io/docs/reference/specification/trace/semantic_conventions/http/
  const context: LogContext = {
    'requestId': requestId,
    'request_id': requestId, // For backward compatibility
    'http.method': request.method,
    'http.url': request.url,
    'http.target': url.pathname,
    'http.host': url.host,
    'http.scheme': url.protocol.replace(':', ''),
    'http.user_agent': request.headers.get('user-agent') || 'unknown',
    ...traceContext,
    ...additionalContext
  };
  
  // Create logger with HTTP context
  return logger.child(context);
}

// LogManager class
export class LogManager {
  private static instance: LogManager | null = null;
  private config: LogSchema;
  
  private constructor() {
    this.config = this.loadConfiguration();
  }
  
  private loadConfiguration(): LogSchema {
    // Properly filter and cast to LogTarget[]
    const logTargets = logTargetsStr 
      ? (logTargetsStr.split(',')
          .map(t => t.trim())
          .filter(t => ['console', 'file', 'opentelemetry'].includes(t)) as LogTarget[])
      : ['console' as LogTarget];
      
    const redactFieldsStr = getEnv('REDACT_FIELDS', logDefaults.REDACT_FIELDS);
    const redactFields = redactFieldsStr
      ? redactFieldsStr.split(',').map((f: string) => f.trim())
      : ['password', 'secret', 'token', 'authorization', 'cookie'];
    
    return {
      LOG_LEVEL: this.isValidLogLevel(logLevel) ? logLevel as LogLevel : 'info',
      LOG_TARGETS: logTargets,
      LOG_FILE_PATH: getEnv('LOG_FILE_PATH', logDefaults.LOG_FILE_PATH),
      LOG_FORMAT: this.isValidLogFormat(logFormat) ? logFormat as LogFormat : 'json',
      LOG_FILE_ROTATION: getBoolEnv('LOG_FILE_ROTATION', true),
      LOG_MAX_SIZE: getNumEnv('LOG_MAX_SIZE', 10 * 1024 * 1024),
      LOG_INCLUDE_TIMESTAMP: getBoolEnv('LOG_INCLUDE_TIMESTAMP', true),
      LOG_INCLUDE_HOSTNAME: getBoolEnv('LOG_INCLUDE_HOSTNAME', true),
      CORRELATION_ID_HEADER: getEnv('CORRELATION_ID_HEADER', logDefaults.CORRELATION_ID_HEADER) || 'X-Correlation-ID',
      REDACT_FIELDS: redactFields
    };
  }
  
  // Type guard for log level
  private isValidLogLevel(level: string): level is LogLevel {
    return ['trace', 'debug', 'info', 'warn', 'error', 'fatal'].includes(level);
  }
  
  // Type guard for log format
  private isValidLogFormat(format: string): format is LogFormat {
    return ['json', 'pretty'].includes(format);
  }
  
  public static getInstance(): LogManager {
    if (!LogManager.instance) {
      LogManager.instance = new LogManager();
    }
    return LogManager.instance;
  }
  
  public getLogger(): LoggerInstance {
    return logger;
  }
  
  public getConfig(): LogSchema {
    return { ...this.config };
  }
}

// Export a singleton instance of the LogManager
export const logManager = LogManager.getInstance();

// Utility functions
export function redactSensitiveInfo(
  obj: unknown, 
  sensitiveFields: string[] = ['password', 'token', 'secret', 'authorization']
): unknown {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => redactSensitiveInfo(item, sensitiveFields));
  }
  
  const result: Record<string, unknown> = { ...obj as Record<string, unknown> };
  
  for (const key in result) {
    if (Object.prototype.hasOwnProperty.call(result, key)) {
      if (sensitiveFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
        result[key] = '[REDACTED]';
      } else if (typeof result[key] === 'object' && result[key] !== null) {
        result[key] = redactSensitiveInfo(result[key], sensitiveFields);
      }
    }
  }
  
  return result;
}

export function safeStringify(obj: unknown): string {
  try {
    return JSON.stringify(obj);
  } catch (error) {
    return String(obj);
  }
}

export function formatObject(
  obj: unknown, 
  options: {
    depth?: number;
    colors?: boolean;
    maxArrayLength?: number;
    breakLength?: number;
    compact?: boolean;
    sorted?: boolean;
  } = {}
): string {
  const defaults = {
    depth: 4,
    colors: isNodeEnvironment && process.env.NODE_ENV !== 'production',
    maxArrayLength: 100,
    breakLength: 80,
    compact: false,
    sorted: true
  };
  
  const config = { ...defaults, ...options };
  
  try {
    return JSON.stringify(obj, null, 2);
  } catch (error) {
    return String(obj);
  }
}

/**
 * Creates a Pino logger configuration based on log targets
 * @param logTargets Array of log targets (e.g. ['console', 'file'])
 * @param logLevel Log level (default: 'info')
 * @param logFilePath Path for log files (default: './logs')
 * @returns Pino LoggerOptions configuration
 */
export function createPinoConfig(
  logTargets: string[],
  logLevel: string = 'info',
  logFilePath: string = './logs'
): LoggerOptions<never, boolean> {
  // Map log targets to transport targets
  const targets: TransportTargetOptions[] = [];
  const Timestamp = DateTime.now().setZone(logTimeZone).toISO();

  // Process each log target
  logTargets.forEach(target => {
    const trimmedTarget = target.trim();

    // Configure console transport
    if (trimmedTarget === 'console') {
      targets.push({
        target: 'pino-pretty',
        level: logLevel,
        options: {
          colorize: true,
          ignore: 'pid,hostname',
          messageFormat: '{msg} {attributes}',
          translateTime: true,
        }
      });
    }

    // Configure file transport
    else if (trimmedTarget === 'file') {
      const file = safeLogFilePath(logFilePath, 'app.log');
      targets.push({
        target: 'pino/file',
        level: logLevel,
        options: {
          destination: file,
          mkdir: true,
          sync: true,
        },
      });
    }

    // Configure OpenTelemetry transport
    else if (trimmedTarget === 'opentelemetry') {
      targets.push({
        target: 'pino-opentelemetry-transport',
        level: logLevel,
        options: {
          serviceNameTag: getEnv('OTEL_SERVICE_NAME', 'unknown_service'),
          endpoint: getEnv('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://localhost:4317'),
          metadata: {
            serviceNamespace: getEnv('OTEL_SERVICE_NAMESPACE', 'default')
          }
        }
      });
    }
  });

  // Return the config with transport object
  return {//TODO: corregit estoYAAAAAAAA!
    level: logLevel,
    depthLimit: 5,
    edgeLimit: 100,
    customLevels: 'trace:10,debug:20,info:30,warn:40,error:50,fatal:60',
    timestamp: () => `,"time":"${Timestamp}"`,
    transport: {
      targets,
    },
    // Add hooks for OpenTelemetry integration
    hooks: {
      logMethod: function(inputArgs: any[], method: any, level: any) {
        // Format as OpenTelemetry log record
        if (inputArgs.length && typeof inputArgs[0] === 'object') {
          const traceContext = getTraceContext();
          // Add trace context if not present
          if (traceContext.TraceId && !inputArgs[0].trace_Id) {
            inputArgs[0].trace_id = traceContext.TraceId;
          }
          if (traceContext.SpanId && !inputArgs[0].span_id) {
            inputArgs[0].span_id = traceContext.SpanId;
          }
        }
        return method.apply(this, inputArgs);
      }
    }
  };
}

/**
 * Safely joins path segments and ensures directory paths end with a separator
 * @param {string} basePath The base directory path
 * @param {string} filename The filename to append
 * @returns {string} Properly joined path with filename
 */
export function safeLogFilePath(basePath: string, filename: string): string {
  // Normalize separators to forward slash
  const normalizedPath = basePath.replace(/[\\\/]+/g, '/');
  const normalizedFilename = filename.replace(/[\\\/]+/g, '/');
  
  // Ensure base path ends with a slash
  const baseWithSlash = normalizedPath.endsWith('/') 
    ? normalizedPath 
    : normalizedPath + '/';
  
  // Remove any leading slash from filename
  const cleanFilename = normalizedFilename.startsWith('/') 
    ? normalizedFilename.slice(1) 
    : normalizedFilename;
  
  // Join the path and filename
  return baseWithSlash + cleanFilename;
}

/**
 * Creates a span context for distributed tracing
 * @param {string} name The name of the span
 * @param {Record<string, any>} attributes Optional attributes to add to the span
 * @returns {Object} Span context information
 */
export function createSpanContext(name: string, attributes: Record<string, any> = {}): { 
  trace_id1?: string;
  span_id1?: string;
  parent_span_id1?: string;
  trace_flags1?: number;
  attributes: Record<string, any>;
} {
  // Get existing trace context
  const currentContext = getTraceContext();
  
  // Create a new span ID while maintaining the same trace ID
  const { SpanId, ParentSpanId } = createNewSpan();
  
  // Return span context
  return {//TODO: corregit estoYAAAAAAAA!
   // trace_id1: currentContext.TraceId || randomHex(32).toLowerCase(),
   // span_id1: SpanId,
   // parent_span_id1: ParentSpanId,
   // trace_flags1: currentContext.TraceFlags || 1,
    attributes: { //TODO: corregit estoYAAAAAAAA!, este Atributes con mayuscula
      'span.name': name,
      ...attributes
    }
  };
}

/**
 * Gets W3C traceparent header value from current context
 * @returns {string} W3C traceparent header value
 */
export function getTraceparentHeader(): string {
  const context = getTraceContext();
  if (!context.TraceId || !context.SpanId) {
    return '';
  }
  
  // Format: version-traceId-spanId-flags
  return `00-${context.TraceId}-${context.SpanId}-${(context.TraceFlags || 1).toString(16).padStart(2, '0')}`;
}

/**
 * Converts a log record to OpenTelemetry format
 * This is useful when integrating with OpenTelemetry directly without Pino
 */
export function toOtelLogRecord(
  level: string, 
  message: string | Record<string, any>, 
  attributes: Record<string, any> = {}
): OtelLogRecord {
  const timestamp = DateTime.now().setZone(logTimeZone).toISO() || DateTime.now().toLocal().toString();; 
  const traceContext = getTraceContext();
  const resource = getResourceInfo();
  
  // Create base record with trace context
  const record: OtelLogRecord = {//TODO: corregit estoYAAAAAAAA!

    Timestamp: timestamp,
    TraceId: traceContext.TraceId || randomHex(32).toLowerCase(), //TODO: || add this?  "00000000000000000000000000000000" ??? https://www.w3.org/TR/trace-context/#trace-id
    SpanId: traceContext.SpanId || randomHex(16).toLowerCase(), //TODO: || "0000000000000000" ???
    TraceFlags: traceContext.TraceFlags || 1,
    SeverityNumber: getSeverityNumber(level),
    SeverityText: level,
   // Body: data, TODO: add or not body?
    //Attributes: { ...baseContext, ...additionalAttrs }, TODO: add attributes?
    Resource:resource,
    //...traceContext

  };
  
  // Add body based on message type
  if (typeof message === 'string') {
    record.Body = message;
    record.Attributes = attributes;
  } else if (message && typeof message === 'object') {
    // Check if message has a 'message' property
    if ('message' in message) {
      record.Body = message.message;
      // Remove message property to avoid duplication
      const { message: _, ...rest } = message;
      record.Attributes = { ...rest, ...attributes };
    } else {
      // Use entire object as body
      record.Body = message;
      record.Attributes = attributes;
    }
  } else {
    record.Body = String(message);
    record.Attributes = attributes;
  }
  
  return record;
}