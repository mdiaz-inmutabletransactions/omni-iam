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
 * @returns A promise logger instance with component context
 */
export async function createComponentLogger(
  componentName: string,
  additionalContext: LogContext = {}
): Promise<LoggerInstance> {
  return await createContextLogger({
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
 * @returns A promise logger instance with operation context
 */
export async function createOperationLogger(
  operationName: string,
  requestId: string = crypto.randomUUID(),
  additionalContext: LogContext = {}
): Promise<LoggerInstance> {
  // Create span context for the operation
  const spanContext = createSpanContext(operationName, {
    'operation.name': operationName,
    ...additionalContext
  });
  
  return await createContextLogger({
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
 * @returns A promise logger instance with HTTP request context
 */
export async function createRequestLogger(
  request: Request,
  additionalContext: LogContext = {}
): Promise<LoggerInstance> {
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
  
  return await createContextLogger({
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
export async function createEventLogger(domain: string, additionalContext: LogContext = {}) {
  const baseContext = {
    'event.domain': domain,
    ...additionalContext
  };
  
  // Create base logger
  const baseLogger = await createContextLogger(baseContext);
  
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
export async function createMetricLogger(additionalContext: LogContext = {}) {
  // Create base logger
  const baseLogger = await createContextLogger({
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
export async function createSessionLogger(
  sessionId: string, 
  userId?: string,
  additionalContext: LogContext = {}
): Promise<LoggerInstance> {
  const sessionContext: LogContext = {
    'session.id': sessionId,
    ...additionalContext
  };
  
  if (userId) {
    sessionContext['user.id'] = userId;
  }
  
  return await createContextLogger(sessionContext);
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