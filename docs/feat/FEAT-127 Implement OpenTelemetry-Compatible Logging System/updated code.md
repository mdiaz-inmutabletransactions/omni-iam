I'll create updated versions of these functions that follow modern observability standards according to OpenTelemetry specifications. Let me analyze what we need to improve:

1. Allow setting of attributes both at initialization and log time
2. Implement the OpenTelemetry data model for logs
3. Support W3C trace context
4. Add proper resource detection
5. Implement Log and Event Record definitions

Let me create an updated version of the `logs.ts` file:

```typescript
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
  safeLog
} from '../config/enviroment';

// For OpenTelemetry trace context propagation
import { DateTime } from 'luxon';

// Define log levels as a union type
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

// Define log targets as a union type
export type LogTarget = 'console' | 'file' | 'opentelemetry';

// Define log formats
export type LogFormat = 'json' | 'pretty';

// Define RedactOptions interface
interface RedactOptions {
  paths: string[];
  remove?: boolean;
  censor?: string;
}

// OpenTelemetry Log and Event Record definition
// https://opentelemetry.io/docs/specs/otel/logs/data-model/#log-and-event-record-definition
export interface OtelLogRecord {
  // Timestamp (ISO8601-compatible string in nanoseconds)
  time?: string;
  // Observed timestamp
  observed_time?: string;
  // Trace context
  trace_id?: string;
  span_id?: string;
  trace_flags?: number;
  // Severity
  severity_number?: number;
  severity_text?: string;
  // Content fields
  body?: string | Record<string, any>;
  attributes?: Record<string, any>;
  // Resource information
  resource?: Record<string, any>;
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
function getTraceContext(): { traceId?: string, spanId?: string, traceFlags?: number } {
  // Check if we have a parent trace context (from environment, headers, etc.)
  const traceparent = typeof process !== 'undefined' ? process.env.TRACEPARENT : undefined;
  
  if (traceparent) {
    try {
      // Parse W3C trace context format: 00-traceId-spanId-flags
      // https://www.w3.org/TR/trace-context/#traceparent-header
      const parts = traceparent.split('-');
      if (parts.length === 4) {
        return {
          traceId: parts[1],
          spanId: parts[2],
          traceFlags: parseInt(parts[3], 16)
        };
      }
    } catch (e) {
      // If parsing fails, generate a new trace context
      console.error('Failed to parse trace context:', e);
    }
  }
  
  // Generate a new trace context if none exists
  if (isNodeEnvironment) {
    return {
      traceId: randomHex(32),
      spanId: randomHex(16),
      traceFlags: 1 // Sampled
    };
  }
  
  return {};
}

// Generate random hex string for trace/span IDs
function randomHex(length: number): string {
  const bytes = new Uint8Array(length / 2);
  
  if (isNodeEnvironment) {
    // Node.js environment - use crypto
    const crypto = require('crypto');
    crypto.randomFillSync(bytes);
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
      const os = require('os');
      resourceInfo['host.name'] = os.hostname();
      resourceInfo['host.arch'] = os.arch();
      resourceInfo['host.type'] = os.type();
      resourceInfo['process.pid'] = process.pid;
      resourceInfo['process.runtime.name'] = 'node';
      resourceInfo['process.runtime.version'] = process.version;
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
    const timestamp = DateTime.now().toISO();
    const traceContext = getTraceContext();
    const severityNumber = getSeverityNumber(level);
    
    // Create OpenTelemetry-compatible log record
    let logRecord: OtelLogRecord;
    
    if (typeof data === 'string') {
      // Convert string message to log record
      logRecord = {
        time: timestamp,
        severity_number: severityNumber,
        severity_text: level,
        body: data,
        attributes: { ...baseContext, ...additionalAttrs },
        resource,
        ...traceContext
      };
    } else if (data && typeof data === 'object') {
      // Check if it's already a log record
      if ('body' in data || 'severity_number' in data) {
        // It's already a log record, just supplement it
        logRecord = {
          ...data,
          time: data.time || timestamp,
          severity_number: data.severity_number || severityNumber,
          severity_text: data.severity_text || level,
          attributes: { ...baseContext, ...(data.attributes || {}), ...(additionalAttrs || {}) },
          resource: { ...resource, ...(data.resource || {}) },
          ...traceContext
        };
      } else {
        // It's just a data object, use it as the body
        logRecord = {
          time: timestamp,
          severity_number: severityNumber,
          severity_text: level,
          body: data,
          attributes: { ...baseContext, ...additionalAttrs },
          resource,
          ...traceContext
        };
      }
    } else {
      // Fallback for other data types
      logRecord = {
        time: timestamp,
        severity_number: severityNumber,
        severity_text: level,
        body: String(data),
        attributes: { ...baseContext, ...additionalAttrs },
        resource,
        ...traceContext
      };
    }
    
    // For console output, try to make it readable
    const consoleOutput = {
      level,
      time: logRecord.time,
      trace_id: logRecord.trace_id,
      ...(typeof logRecord.body === 'string' 
        ? { message: logRecord.body } 
        : { ...logRecord.body }),
      ...(Object.keys(logRecord.attributes || {}).length > 0 ? { attributes: logRecord.attributes } : {})
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
    
    // Event logging (special case of info logs with event name)
    event: (name, data = {}) => { 
      logWithContext('info', { 
        ...data,
        'event.name': name,
        'event.domain': data.domain || 'app'
      });
      return true;
    },
    
    // Metric logging
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
      // Format OpenTelemetry compatible log record 
      Logger.trace(formatOtelLogRecord('trace', data, attrs));
      // Call original to maintain console logging during transition
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
      
      // Create console child logger
      const consoleChild = originalTrace.bind(logger).child(context);
      
      // Combine them
      return {
        trace: (data: any, attrs?: Record<string, any>) => {
          pinoChild.trace(formatOtelLogRecord('trace', data, attrs));
          consoleChild.trace(data, attrs);
          return true;
        },
        debug: (data: any, attrs?: Record<string, any>) => {
          pinoChild.debug(formatOtelLogRecord('debug', data, attrs));
          consoleChild.debug(data, attrs);
          return true;
        },
        info: (data: any, attrs?: Record<string, any>) => {
          pinoChild.info(formatOtelLogRecord('info', data, attrs));
          consoleChild.info(data, attrs);
          return true;
        },
        warn: (data: any, attrs?: Record<string, any>) => {
          pinoChild.warn(formatOtelLogRecord('warn', data, attrs));
          consoleChild.warn(data, attrs);
          return true;
        },
        error: (data: any, attrs?: Record<string, any>) => {
          pinoChild.error(formatOtelLogRecord('error', data, attrs));
          consoleChild.error(data, attrs);
          return true;
        },
        fatal: (data: any, attrs?: Record<string, any>) => {
          pinoChild.fatal(formatOtelLogRecord('fatal', data, attrs));
          consoleChild.fatal(data, attrs);
          return true;
        },
        event: (name: string, data: Record<string, any> = {}) => {
          pinoChild.info(formatOtelLogRecord('info', {
            ...data,
            'event.name': name,
            'event.domain': data.domain || 'app'
          }));
          consoleChild.event(name, data);
          return true;
        },
        metric: (name: string, value: number, attributes: Record<string, any> = {}) => {
          pinoChild.info(formatOtelLogRecord('info', {
            'metric.name': name,
            'metric.value': value,
            ...attributes
          }));
          consoleChild.metric(name, value, attributes);
          return true;
        },
        child: (nestedContext: LogContext) => {
          const combinedContext = { ...context, ...nestedContext };
          return logger.child(combinedContext);
        },
        flush: () => {
          if (pinoChild.flush) pinoChild.flush();
          if (consoleChild.flush) consoleChild.flush();
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
  const timestamp = DateTime.now().toISO();
  const traceContext = getTraceContext();
  const resource = getResourceInfo();
  const severityNumber = getSeverityNumber(level);
  
  // Create the base log record
  const baseRecord: OtelLogRecord = {
    time: timestamp,
    severity_number: severityNumber,
    severity_text: level,
    resource,
    ...traceContext
  };
  
  // Handle different data types
  if (typeof data === 'string') {
    return {
      ...baseRecord,
      body: data,
      attributes: attrs || {}
    };
  } else if (data && typeof data === 'object') {
    // Check if it's already a log record
    if ('body' in data || 'severity_number' in data) {
      return {
        ...baseRecord,
        ...data,
        attributes: { ...(data.attributes || {}), ...(attrs || {}) }
      };
    } else {
      // Extract OTel-specific fields
      const { 
        trace_id, span_id, trace_flags, 
        severity_number: dataSeverity, severity_text: dataLevel,
        ...rest 
      } = data;
      
      // Add trace context from data if provided
      if (trace_id) baseRecord.trace_id = trace_id;
      if (span_id) baseRecord.span_id = span_id;
      if (trace_flags) baseRecord.trace_flags = trace_flags;
      
      // Add severity info from data if provided
      if (dataSeverity) baseRecord.severity_number = dataSeverity;
      if (dataLevel) baseRecord.severity_text = dataLevel;
      
      // Handle message field for backward compatibility
      if ('message' in rest && !('body' in rest)) {
        return {
          ...baseRecord,
          body: rest.message,
          attributes: { ...(rest as any), ...(attrs || {}) }
        };
      }
      
      // Handle body field
      if ('body' in rest) {
        return {
          ...baseRecord,
          body: rest.body,
          attributes: { ...(rest as any), ...(attrs || {}) }
        };
      }
      
      // Default: use entire object as body
      return {
        ...baseRecord,
        body: rest,
        attributes: attrs || {}
      };
    }
  } else {
    // For primitive values
    return {
      ...baseRecord,
      body: String(data),
      attributes: attrs || {}
    };
  }
}

// Export the logger
export { logger };

// Export async helper functions for creating loggers
export async function createContextLogger(context: LogContext = {}): Promise<LoggerInstance> {
  // Generate a new request ID if not provided
  if (!context.requestId && !context.request_id) {
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
  
  // Create child logger with context
  return logger.child(context);
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
  requestId: string = crypto.randomUUID(),
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
  logTargets: string
  logTargets: string[],
  logLevel: string = 'info',
  logFilePath: string = './logs'
): LoggerOptions<never, boolean> {
  // Map log targets to transport targets
  const targets: TransportTargetOptions[] = [];
  const time = DateTime.now().setZone(logTimeZone).toISO();

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
  return {
    level: logLevel,
    depthLimit: 5,
    edgeLimit: 100,
    customLevels: 'trace:10,debug:20,info:30,warn:40,error:50,fatal:60',
    timestamp: () => `,"time":"${time}"`,
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
          if (traceContext.traceId && !inputArgs[0].trace_id) {
            inputArgs[0].trace_id = traceContext.traceId;
          }
          if (traceContext.spanId && !inputArgs[0].span_id) {
            inputArgs[0].span_id = traceContext.spanId;
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
  trace_id: string;
  span_id: string;
  parent_span_id?: string;
  trace_flags: number;
  attributes: Record<string, any>;
} {
  // Get existing trace context
  const currentContext = getTraceContext();
  
  // Generate a new span ID
  const spanId = randomHex(16);
  
  // Return span context
  return {
    trace_id: currentContext.traceId || randomHex(32),
    span_id: spanId,
    parent_span_id: currentContext.spanId,
    trace_flags: currentContext.traceFlags || 1,
    attributes: {
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
  if (!context.traceId || !context.spanId) {
    return '';
  }
  
  // Format: version-traceId-spanId-flags
  return `00-${context.traceId}-${context.spanId}-${(context.traceFlags || 1).toString(16).padStart(2, '0')}`;
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
  const timestamp = DateTime.now().toISO();
  const traceContext = getTraceContext();
  const resource = getResourceInfo();
  
  // Create base record with trace context
  const record: OtelLogRecord = {
    time: timestamp,
    severity_number: getSeverityNumber(level),
    severity_text: level,
    ...traceContext,
    resource
  };
  
  // Add body based on message type
  if (typeof message === 'string') {
    record.body = message;
    record.attributes = attributes;
  } else if (message && typeof message === 'object') {
    // Check if message has a 'message' property
    if ('message' in message) {
      record.body = message.message;
      // Remove message property to avoid duplication
      const { message: _, ...rest } = message;
      record.attributes = { ...rest, ...attributes };
    } else {
      // Use entire object as body
      record.body = message;
      record.attributes = attributes;
    }
  } else {
    record.body = String(message);
    record.attributes = attributes;
  }
  
  return record;
}
```

Now let me create an update for the logUtils.ts file to make it compatible with the OpenTelemetry updates:

```typescript
// app/core/Observability/logUtils.ts

import util from 'util';
import { 
  logger, 
  createContextLogger, 
  LogContext, 
  LoggerInstance, 
  OtelLogRecord,
  createSpanContext,
  getTraceparentHeader,
  toOtelLogRecord
} from './logs';

// Format options interface for better type checking
export interface FormatObjectOptions {
  depth?: number;
  colors?: boolean;
  maxArrayLength?: number;
  breakLength?: number;
  compact?: boolean;
  sorted?: boolean;
}

// Maximum depth for object inspection (prevents circular references issues)
const MAX_DEPTH = 10;

/**
 * Creates a detailed object representation for logging
 * Handles circular references and deeply nested objects
 */
export function formatObject(
  obj: unknown, 
  options: FormatObjectOptions = {}
): string {
  const { 
    depth = MAX_DEPTH, 
    colors = process.env.NODE_ENV !== 'production',
    maxArrayLength = 100,
    breakLength = 120,
    compact = false,
    sorted = true
  } = options;
  
  return util.inspect(obj, {
    depth,
    colors,
    maxArrayLength,
    breakLength,
    compact,
    sorted
  });
}

/**
 * Creates a logger for a specific component with standardized context following OpenTelemetry conventions
 * 
 * @param componentName The name of the component (used for code.namespace in OpenTelemetry)
 * @param additionalContext Additional context to include with all logs
 * @returns A logger instance with component context
 */
export function createComponentLogger(
  componentName: string,
  additionalContext: LogContext = {}
): LoggerInstance {
  return createContextLogger({
    component: componentName,
    'code.namespace': componentName,
    'telemetry.sdk.name': 'opentelemetry',
    'telemetry.sdk.language': 'javascript',
    ...additionalContext
  });
}

/**
 * Creates a logger for a specific operation with standardized context and request tracking
 * 
 * @param operationName The name of the operation (becomes event.name in OpenTelemetry)
 * @param requestId Optional request ID for correlation (generated if not provided)
 * @param additionalContext Additional context to include with all logs
 * @returns A logger instance with operation context
 */
export function createOperationLogger(
  operationName: string,
  requestId: string = crypto.randomUUID(),
  additionalContext: LogContext = {}
): LoggerInstance {
  // Create span context for the operation
  const spanContext = createSpanContext(operationName, {
    'operation.name': operationName,
    ...additionalContext
  });
  
  return createContextLogger({
    operation: operationName,
    requestId,
    'event.name': operationName,
    'code.function': operationName,
    ...spanContext,
    ...additionalContext
  });
}

/**
 * Creates a request-scoped logger with HTTP context following OpenTelemetry semantic conventions
 * 
 * @param request The HTTP request object
 * @param additionalContext Additional context to include with all logs
 * @returns A logger instance with HTTP request context
 */
export function createRequestLogger(
  request: Request,
  additionalContext: LogContext = {}
): LoggerInstance {
  const url = new URL(request.url);
  const requestId = request.headers.get('X-Request-ID') || crypto.randomUUID();
  
  // Extract trace context from headers if available
  let traceContext = {};
  const traceparent = request.headers.get('traceparent');
  
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
      // Ignore parsing errors
    }
  }
  
  // Create span context for the request
  const spanContext = createSpanContext('http.request', {
    'http.method': request.method,
    'http.url': url.toString(),
    'http.target': url.pathname,
    'http.host': url.host,
    'http.scheme': url.protocol.replace(':', ''),
    'http.user_agent': request.headers.get('user-agent') || '',
    ...traceContext
  });
  
  return createContextLogger({
    requestId,
    method: request.method,
    path: url.pathname,
    'http.method': request.method,
    'http.url': url.toString(),
    'http.request_id': requestId,
    ...spanContext,
    ...additionalContext
  });
}

/**
 * Safely stringifies an object for logging, handling circular references
 */
export function safeStringify(obj: unknown): string {
  try {
    return JSON.stringify(obj, getCircularReplacer());
  } catch (err) {
    return formatObject(obj, { colors: false });
  }
}

/**
 * Creates a replacer function for JSON.stringify that handles circular references
 */
function getCircularReplacer(): (key: string, value: unknown) => unknown {
  const seen = new WeakSet();
  return (key: string, value: unknown): unknown => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular Reference]';
      }
      seen.add(value);
    }
    return value;
  };
}

/**
 * Redacts sensitive information from objects
 */
export function redactSensitiveInfo(
  obj: unknown, 
  sensitiveFields: string[] = ['password', 'token', 'secret', 'authorization', 'credential', 'key']
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

/**
 * Creates an event logger that follows OpenTelemetry conventions
 * 
 * @param domain The domain of the event (e.g., 'auth', 'user', 'system')
 * @param additionalContext Additional context for all events
 * @returns An object with methods to log different types of events
 */
export function createEventLogger(domain: string, additionalContext: LogContext = {}) {
  const baseContext = {
    'event.domain': domain,
    ...additionalContext
  };
  
  // Create base logger
  const baseLogger = createContextLogger(baseContext);
  
  return {
    /**
     * Log a standard event
     */
    event: (name: string, data: Record<string, any> = {}) => {
      baseLogger.info({
        'event.name': name,
        ...data
      });
    },
    
    /**
     * Log the start of an operation
     */
    start: (operation: string, data: Record<string, any> = {}) => {
      baseLogger.info({
        'event.name': `${operation}.start`,
        'operation.name': operation,
        'operation.state': 'started',
        ...data
      });
    },
    
    /**
     * Log the success of an operation
     */
    success: (operation: string, data: Record<string, any> = {}) => {
      baseLogger.info({
        'event.name': `${operation}.success`,
        'operation.name': operation,
        'operation.state': 'completed',
        'operation.outcome': 'success',
        ...data
      });
    },
    
    /**
     * Log the failure of an operation
     */
    failure: (operation: string, error: Error | any, data: Record<string, any> = {}) => {
      baseLogger.error({
        'event.name': `${operation}.failure`,
        'operation.name': operation,
        'operation.state': 'completed',
        'operation.outcome': 'failure',
        'error.message': error instanceof Error ? error.message : String(error),
        'error.type': error instanceof Error ? error.name : typeof error,
        'error.stack': error instanceof Error ? error.stack : undefined,
        ...data
      });
    }
  };
}

/**
 * Creates a metric logger that follows OpenTelemetry conventions
 */
export function createMetricLogger(additionalContext: LogContext = {}) {
  // Create base logger
  const baseLogger = createContextLogger({
    'telemetry.type': 'metric',
    ...additionalContext
  });
  
  return {
    /**
     * Log a counter metric
     */
    counter: (name: string, value: number, attributes: Record<string, any> = {}) => {
      baseLogger.info({
        'metric.name': name,
        'metric.type': 'counter',
        'metric.value': value,
        ...attributes
      });
    },
    
    /**
     * Log a gauge metric
     */
    gauge: (name: string, value: number, attributes: Record<string, any> = {}) => {
      baseLogger.info({
        'metric.name': name,
        'metric.type': 'gauge',
        'metric.value': value,
        ...attributes
      });
    },
    
    /**
     * Log a histogram metric
     */
    histogram: (name: string, value: number, attributes: Record<string, any> = {}) => {
      baseLogger.info({
        'metric.name': name,
        'metric.type': 'histogram',
        'metric.value': value,
        ...attributes
      });
    },
    
    /**
     * Start timing an operation
     */
    startTimer: (name: string) => {
      const startTime = performance.now();
      return {
        stop: (attributes: Record<string, any> = {}) => {
          const duration = performance.now() - startTime;
          baseLogger.info({
            'metric.name': name,
            'metric.type': 'histogram',
            'metric.value': duration,
            'metric.unit': 'ms',
            ...attributes
          });
          return duration;
        }
      };
    }
  };
}

/**
 * Logs an error with OpenTelemetry-compatible structure
 * 
 * @param error The error to log
 * @param context Additional context for the error
 * @param level Log level (defaults to error)
 */
export function logError(
  error: Error | any, 
  context: LogContext = {}, 
  level: 'error' | 'fatal' = 'error'
): void {
  const errorContext: Record<string, any> = {
    'error.type': error instanceof Error ? error.name : typeof error,
    'error.message': error instanceof Error ? error.message : String(error),
    'error.stack': error instanceof Error ? error.stack : undefined,
    ...context
  };
  
  // Log the error with the appropriate level
  if (level === 'fatal') {
    logger.fatal(errorContext);
  } else {
    logger.error(errorContext);
  }
}

/**
 * Creates a session logger for tracing user sessions
 * 
 * @param sessionId The session ID to track
 * @param userId Optional user ID associated with the session
 * @param additionalContext Additional context for all session logs
 */
export function createSessionLogger(
  sessionId: string, 
  userId?: string,
  additionalContext: LogContext = {}
): LoggerInstance {
  const sessionContext: LogContext = {
    'session.id': sessionId,
    ...additionalContext
  };
  
  if (userId) {
    sessionContext['user.id'] = userId;
  }
  
  return createContextLogger(sessionContext);
}

/**
 * Gets W3C traceparent header value
 * Useful for propagating trace context in HTTP requests
 */
export { getTraceparentHeader };

/**
 * Converts a log entry to OpenTelemetry format
 * Useful when directly interfacing with OpenTelemetry collectors
 */
export { toOtelLogRecord };

/**
 * Creates span context for distributed tracing
 */
export { createSpanContext };
```

These implementations follow the OpenTelemetry specification for logging, and provide:

1. Proper integration with the W3C Trace Context standard for distributed tracing
2. Support for OpenTelemetry's Log and Event Record definitions
3. Resource detection to include service and host information
4. Flexibility to set attributes both at logger initialization and log emission time
5. Additional utility functions like event and metric logging
6. Better integration with the broader observability ecosystem

The updated functions also maintain backward compatibility while providing more powerful features aligned with modern observability practices.

Would you like me to also create an example showing how these updated functions can be used in practice?
