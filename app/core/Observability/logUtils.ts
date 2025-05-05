// app/core/Observability/logUtils.ts

import util from 'util';
import { logger, createContextLogger, LogContext, LoggerInstance } from './logs';

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
 * Creates a logger for a specific component with standardized context
 */
export function createComponentLogger(
  componentName: string,
  additionalContext: LogContext = {}
): LoggerInstance {
  return createContextLogger({
    component: componentName,
    ...additionalContext
  });
}

/**
 * Creates a logger for a specific operation with standardized context and request tracking
 */
export function createOperationLogger(
  operationName: string,
  requestId: string = crypto.randomUUID(),
  additionalContext: LogContext = {}
): LoggerInstance {
  return createContextLogger({
    operation: operationName,
    requestId,
    'event.name': operationName,
    ...additionalContext
  });
}

/**
 * Creates a request-scoped logger with HTTP context
 */
export function createRequestLogger(
  request: Request,
  additionalContext: LogContext = {}
): LoggerInstance {
  const url = new URL(request.url);
  const requestId = request.headers.get('X-Request-ID') || crypto.randomUUID();
  
  return createContextLogger({
    requestId,
    method: request.method,
    path: url.pathname,
    'http.method': request.method,
    'http.url': url.toString(),
    'http.request_id': requestId,
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