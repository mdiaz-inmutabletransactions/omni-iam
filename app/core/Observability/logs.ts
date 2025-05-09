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
export function getTraceContext(): { traceId?: string, spanId?: string, traceFlags?: number } {
  
  if (TRACE_CONTEXT_STORE.initialized && TRACE_CONTEXT_STORE.traceId) {
    return {
      traceId: TRACE_CONTEXT_STORE.traceId,
      spanId: TRACE_CONTEXT_STORE.spanId,
      traceFlags: TRACE_CONTEXT_STORE.traceFlags
    };
  }
  
  
  // Check if we have a parent trace context (from environment, headers, etc.)
  const traceparent = typeof process !== 'undefined' ? process.env.TRACEPARENT : undefined;
  
  if (traceparent) {
    try {
      // Parse W3C trace context format: 00-traceId-spanId-flags
      // https://www.w3.org/TR/trace-context/#traceparent-header
      const parts = traceparent.split('-');
      if (parts.length === 4) {

        TRACE_CONTEXT_STORE.traceId = parts[1];
        TRACE_CONTEXT_STORE.spanId = parts[2];
        TRACE_CONTEXT_STORE.traceFlags = parseInt(parts[3], 16);
        TRACE_CONTEXT_STORE.initialized = true;

        return {
          traceId: TRACE_CONTEXT_STORE.traceId,
          spanId: TRACE_CONTEXT_STORE.spanId,
          traceFlags: TRACE_CONTEXT_STORE.traceFlags
        };
      }
    } catch (e) {
      // If parsing fails, generate a new trace context
      console.error('Failed to parse trace context:', e);
    }
  }
  
  // Generate a new trace context if none exists
  /*if (isNodeEnvironment) {
    return {
      traceId: randomHex(32),
      spanId: randomHex(16),
      traceFlags: 1 // Sampled
    };
  }
  
  return {};*/

  if (!TRACE_CONTEXT_STORE.initialized) {
    TRACE_CONTEXT_STORE.traceId = randomHex(32).toLowerCase();
    TRACE_CONTEXT_STORE.spanId = randomHex(16).toLowerCase();
    TRACE_CONTEXT_STORE.traceFlags = 1;
    TRACE_CONTEXT_STORE.initialized = true;
  }
  
  return {
    traceId: TRACE_CONTEXT_STORE.traceId,
    spanId: TRACE_CONTEXT_STORE.spanId,
    traceFlags: TRACE_CONTEXT_STORE.traceFlags
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
export function createNewSpan(): { spanId: string, parentSpanId: string } {
  const currentSpanId = TRACE_CONTEXT_STORE.spanId;
  const newSpanId = randomHex(16).toLowerCase();
  TRACE_CONTEXT_STORE.spanId = newSpanId;
  return {
    spanId: newSpanId,
    parentSpanId: currentSpanId
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
    finalSpanId = span.spanId;
    finalParentSpanId = span.parentSpanId;
  }
  
  // Create the final context with standardized field names
  const standardizedContext: LogContext = {
    ...restContext,
    requestId,
    request_id: requestId,
    // Use standardized OpenTelemetry field names (snake_case)
    trace_id: traceContext.traceId,
    span_id: finalSpanId,
    trace_flags: traceContext.traceFlags
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
  
  // Create a new span ID while maintaining the same trace ID
  const { spanId, parentSpanId } = createNewSpan();
  
  // Return span context
  return {
    trace_id: currentContext.traceId || randomHex(32).toLowerCase(),
    span_id: spanId,
    parent_span_id: parentSpanId,
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