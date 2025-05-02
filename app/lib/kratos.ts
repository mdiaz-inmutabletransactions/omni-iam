import { spawn } from 'child_process';
import { DateTime } from 'luxon';
import { listTimeZones } from 'timezone-support';
import { inspect } from 'util';
import pino from 'pino';
import * as pinoOtel from 'pino-opentelemetry-transport';

// Ory Kratos API utilities for Remix
const KRATOS_BASE_URL = process.env.KRATOS_PUBLIC_URL || 'http://localhost:4433'
let TIMEZONE = process.env.KRATOS_TIMEZONE || 'Etc/UTC';
let LOCALE = process.env.LOCALE || 'en-US';

// Format timestamp for logs - with better error handling
function formatTimestamp(): string {
  try {
    // First, validate the timezone
    const validTimezones = listTimeZones();
    let timezone = TIMEZONE;
    
    if (!validTimezones.includes(timezone)) {
      console.warn(`Invalid timezone: "${timezone}", using Etc/UTC instead`);
      timezone = 'Etc/UTC';
    }
    
    const locale = LOCALE || 'en-US';
    const dt = DateTime.utc().setZone(timezone).setLocale(locale);
    
    if (!dt.isValid) {
      return new Date().toUTCString();
    }
    
    return dt.toLocaleString(DateTime.DATETIME_FULL);
  } catch (error) {
    return new Date().toUTCString();
  }
}

// Map pino level numbers to level names
const LEVEL_NAMES = {
  10: 'TRACE',
  20: 'DEBUG',
  30: 'INFO ',
  40: 'WARN ',
  50: 'ERROR',
  60: 'FATAL'
};

// Create a custom console transport with deep object inspection
const consoleTransport = {
  write: (data) => {
    try {
      // Parse JSON if it's a string
      const logData = typeof data === 'string' ? JSON.parse(data) : data;
      
      // Format message with timestamp
      const timestamp = formatTimestamp();
      const level = logData.level;
      
      // Get the proper level name from our mapping
      const levelName = LEVEL_NAMES[level] || 'INFO ';
      
      // Get the message
      const message = logData.msg || '';
      
      // Remove standard fields for cleaner context output
      const context = { ...logData };
      delete context.level;
      delete context.time;
      delete context.pid;
      delete context.hostname;
      delete context.msg;
      
      // Only show context if there are additional fields
      const hasContext = Object.keys(context).length > 0;
      
      // Format the log with deep inspection of objects
      const formattedMessage = `[${timestamp}] ${levelName} ${message}`;
      
      if (level >= 50) { // error or fatal
        console.error(formattedMessage);
        if (hasContext) {
          console.error(inspect(context, { depth: null, colors: true }));
        }
      } else if (level >= 40) { // warn
        console.warn(formattedMessage);
        if (hasContext) {
          console.warn(inspect(context, { depth: null, colors: true }));
        }
      } else if (level >= 30) { // info
        console.info(formattedMessage);
        if (hasContext) {
          console.info(inspect(context, { depth: null, colors: true }));
        }
      } else { // debug or trace
        console.log(formattedMessage);
        if (hasContext) {
          console.log(inspect(context, { depth: null, colors: true }));
        }
      }
    } catch (error) {
      // Fallback if JSON parsing fails
      console.log(data);
    }
    
    return true;
  }
};

// Create the logger with a lower level to see debug logs
const logger = pino({
  // Set level to 'debug' to ensure we see the response logs
  level: process.env.LOG_LEVEL || 'debug',
  base: {
    pid: process.pid,
    hostname: process.env.HOSTNAME || 'localhost'
  },
  timestamp: () => `,"time":"${formatTimestamp()}"`,
  formatters: {
    level(label) {
      return { level: label };
    }
  },
}, consoleTransport);

function validateEnv() {
  // Validate and correct time zone
  try {
    const match = listTimeZones().includes(TIMEZONE);
    if (!match) {
      logger.warn(`Invalid timezone format: "${TIMEZONE}" — falling back to "Etc/UTC". See https://en.wikipedia.org/wiki/List_of_tz_database_time_zones for valid IANA time zone identifiers.`);
      TIMEZONE = 'Etc/UTC';
      process.env.KRATOS_TIMEZONE = TIMEZONE;
    } else {
      logger.info(`Timezone set to "${TIMEZONE}"`);
    }
  } catch (error) {
    logger.error(`Error validating timezone: ${error.message}`);
    TIMEZONE = 'Etc/UTC';
    process.env.KRATOS_TIMEZONE = TIMEZONE;
  }

  // Validate and correct locale
  try {
    const isLocaleValid = Intl.DateTimeFormat.supportedLocalesOf(LOCALE).length > 0;
  
    if (!isLocaleValid) {
      throw new RangeError(`Invalid locale: "${LOCALE}"`);
    }
  
    logger.info(`Locale set to "${LOCALE}"`);
  } catch (err) {
    logger.warn(`Invalid locale: "${LOCALE}" — falling back to "en-US".`);
    logger.warn(`It should be a valid locale identifier. See:`);
    logger.warn(`- https://en.wikipedia.org/wiki/ISO_639-1`);
    logger.warn(`- https://en.wikipedia.org/wiki/Locale_(computer_software)`);
    logger.warn(`- https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Locale`);
    LOCALE = 'en-US';
    process.env.LOCALE = LOCALE;
  }
}

// Run validation once at app startup
validateEnv();

// Create a child logger with span context for distributed tracing
function createContextLogger(context: Record<string, any> = {}) {
  // Add trace and span IDs if available from current context
  const enhancedContext = {
    ...context,
    // These will be populated by OpenTelemetry if tracing is active
    'trace.id': context.traceId || undefined,
    'span.id': context.spanId || undefined,
  };
  
  return logger.child(enhancedContext);
}

// Common headers for Kratos API requests
const kratosHeaders = {
  'Accept': 'application/json',
  'Content-Type': 'application/json',
  credentials: 'include' as const,
}

// Types for Kratos responses
export interface KratosFlow {
  id: string
  ui: {
    nodes: Array<{
      attributes: any
      group: string
      messages?: Array<{ text: string }>
      meta: any
      type: string
    }>
  }
}

export interface KratosError {
  error: {
    code: number
    message: string
    reason: string
  }
}

// Middleware types
type RequestMiddleware = (url: string, options: RequestInit) => [string, RequestInit]
type ResponseMiddleware<T = any> = (response: Response) => Promise<T | Response>

// Debug logging middleware using Pino with OpenTelemetry context
const debugLoggingMiddleware = {
  request: (requestId: string = crypto.randomUUID()): RequestMiddleware => (url, options) => {
    const requestLogger = createContextLogger({ 
      requestId, 
      method: options.method || 'GET',
      url,
      component: 'kratosFetch',
      'http.method': options.method || 'GET',
      'http.url': url,
      'http.request_id': requestId
    });
    
    // Log at INFO level instead of DEBUG to ensure it's always visible
    requestLogger.info({
      msg: 'Kratos API Request',
      headers: options.headers,
      payload: options.body ? tryParseJSON(options.body as string) : undefined
    });
    
    // Add correlation ID to request headers for distributed tracing
    const enhancedOptions = {
      ...options,
      headers: {
        ...options.headers,
        'X-Correlation-ID': requestId,
        'traceparent': process.env.OTEL_TRACE_PARENT || '',
        'tracestate': process.env.OTEL_TRACE_STATE || ''
      }
    };
    
    return [url, enhancedOptions];
  },
  
  response: <T>(requestId: string = crypto.randomUUID()): ResponseMiddleware<T> => async (response) => {
    const clone = response.clone();
    const clientCorrelationId = response.headers.get('X-Correlation-ID') || requestId;
    const serverCorrelationId = response.headers.get('Set-Correlation-ID') || 'none';
    
    const responseLogger = createContextLogger({ 
      requestId: clientCorrelationId,
      correlationId: serverCorrelationId,
      status: response.status,
      url: response.url,
      component: 'kratosFetch',
      'http.status_code': response.status,
      'http.response_url': response.url
    });
    
    let responseBody;
    try {
      responseBody = await clone.json();
    } catch (err) {
      try {
        responseBody = await clone.text();
      } catch (textErr) {
        responseBody = '[Unable to read response body]';
      }
    }
    
    // Always log at INFO level instead of debug/error to ensure visibility
    responseLogger.info({
      msg: `Kratos API Response ${response.ok ? '(Success)' : '(Error)'}`,
      headers: Object.fromEntries(clone.headers.entries()),
      body: responseBody
    });

    // Return the original response to allow chaining
    return response;
  }
};

// Helper function to safely parse JSON
function tryParseJSON(jsonString: string) {
  try {
    return JSON.parse(jsonString);
  } catch (e) {
    return jsonString;
  }
}

// Generic Kratos fetch wrapper with middleware and telemetry support
async function kratosFetch<T = any>(
  endpoint: string,
  options: RequestInit = {},
  middlewares?: {
    request?: RequestMiddleware[]
    response?: ResponseMiddleware<T>[]
  },
  debug = true,
  retryCount = 0
): Promise<T> {
  const requestId = crypto.randomUUID();
  const requestLogger = createContextLogger({ 
    requestId, 
    endpoint,
    operation: 'kratosFetch',
    component: 'kratos-api'
  });

  try {
    // Always add debug middleware
    middlewares = {
      request: [...(middlewares?.request || []), debugLoggingMiddleware.request(requestId)],
      response: [...(middlewares?.response || []), debugLoggingMiddleware.response<T>(requestId)]
    };
    
    let url = `${KRATOS_BASE_URL}${endpoint}`;
    let requestOptions: RequestInit = {
      ...options,
      headers: {
        ...kratosHeaders,
        ...options.headers,
      }
    };

    // Apply request middleware
    if (middlewares?.request) {
      for (const middleware of middlewares.request) {
        [url, requestOptions] = middleware(url, requestOptions);
      }
    }

    requestLogger.info({ msg: 'Fetching Kratos API', url });
    const response = await fetch(url, requestOptions);

    // Apply response middleware before checking for errors
    if (middlewares?.response) {
      for (const middleware of middlewares.response) {
        await middleware(response);
      }
    }

    if (!response.ok) {
      throw await parseKratosError(response, requestId);
    }

    // Handle successful response
    const data = await response.json();

    return {
      ...data,
      _metadata: {
        headers: Object.fromEntries(response.headers.entries()),
        requestId
      }
    };
  } catch (error) {
    requestLogger.error({ 
      msg: 'Kratos API Error', 
      error,
      'error.type': error instanceof Error ? error.name : typeof error,
      'error.message': error instanceof Error ? error.message : String(error),
      'error.stack': error instanceof Error ? error.stack : undefined
    });
    throw error;
  }
}

// Initialize a login flow
export async function initLoginFlow(debug = false): Promise<KratosFlow> {
  const requestId = crypto.randomUUID();
  const flowLogger = createContextLogger({ 
    requestId, 
    operation: 'initLoginFlow',
    component: 'authentication',
    'event.name': 'login.flow.init'
  });
  
  flowLogger.info('Initializing login flow');
  const flow = await kratosFetch('/self-service/login/browser', {}, undefined, debug);

  if (flow.ui?.messages) {
    flow.ui.messages.forEach((message: { text: string }) => {
      flowLogger.info({ 
        msg: 'Login flow message', 
        message: message.text,
        flowId: flow.id 
      });
    });
  }
  
  flowLogger.info({ 
    msg: 'Login flow initialized', 
    flowId: flow.id,
    'event.outcome': 'success' 
  });
  return flow;
}

// Initialize a registration flow
export async function initRegistrationFlow(debug = false): Promise<KratosFlow> {
  const requestId = crypto.randomUUID();
  const flowLogger = createContextLogger({ 
    requestId, 
    operation: 'initRegistrationFlow',
    component: 'authentication',
    'event.name': 'registration.flow.init'
  });
  
  flowLogger.info('Initializing registration flow');
  const flow = await kratosFetch('/self-service/registration/browser', {}, undefined, debug);
  
  flowLogger.info({ 
    msg: 'Registration flow initialized', 
    flowId: flow.id,
    'event.outcome': 'success'
  });
  return flow;
}

// Submit login form
export async function submitLogin(flowId: string, body: any, debug = false): Promise<any> {
  const requestId = crypto.randomUUID();
  const loginLogger = createContextLogger({ 
    requestId, 
    operation: 'submitLogin', 
    flowId,
    component: 'authentication',
    'event.name': 'login.submit',
    'flow.id': flowId
  });
  
  loginLogger.info({ msg: 'Submitting login form', flowId });
  
  try {
    const result = await kratosFetch(`/self-service/login?flow=${flowId}`, {
      method: 'POST',
      body: JSON.stringify(body)
    }, undefined, debug);
    
    loginLogger.info({ 
      msg: 'Login successful',
      'event.outcome': 'success'
    });
    return result;
  } catch (error: unknown) {
    loginLogger.error({ 
      msg: 'Login failed', 
      error,
      'event.outcome': 'failure',
      'error.type': error instanceof Error ? error.name : typeof error,
      'error.message': error instanceof Error ? error.message : String(error)
    });
    
    if (error instanceof Error) {
      throw error;
    }
    if (typeof error === 'object' && error !== null && 'error' in error) {
      const kratosError = error as { error?: { message?: string } };
      throw new Error(kratosError.error?.message || 'Unknown error');
    }
    throw new Error('Unknown error');
  }
}

// Error handling
async function parseKratosError(response: Response, requestId: string): Promise<KratosError> {
  const errorLogger = createContextLogger({ 
    requestId, 
    status: response.status,
    url: response.url,
    component: 'error-handler',
    'http.status_code': response.status,
    'http.url': response.url
  });
  
  try {
    const error = await response.json();
    errorLogger.error({ 
      msg: 'Kratos API Error',
      error,
      'error.code': response.status,
      'error.message': error.error?.message,
      'error.reason': error.error?.reason,
      headers: Object.fromEntries(response.headers.entries())
    });
    
    return {
      error: {
        code: response.status,
        message: error.error?.message || 'Unknown error',
        reason: error.error?.reason || 'unknown_reason'
      }
    };
  } catch (err) {
    errorLogger.error({ 
      msg: 'Failed to parse Kratos error response',
      rawResponse: await response.text(),
      parseError: err,
      'error.type': 'parse_error'
    });
    
    return {
      error: {
        code: response.status,
        message: 'Failed to parse error response',
        reason: 'parse_error'
      }
    };
  }
}

// Setup proper shutdown handling
process.on('SIGINT', () => {
  logger.info('Received SIGINT signal, shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM signal, shutting down...');
  process.exit(0);
});

// Try to initialize OpenTelemetry, with a safe fallback
// Try to initialize OpenTelemetry, with a safe fallback
import { spawn } from 'child_process';
import { DateTime } from 'luxon';
import { listTimeZones } from 'timezone-support';
import { inspect } from 'util';
import pino from 'pino';
// Import the default export from the OpenTelemetry transport
import pinoOtelTransport from 'pino-opentelemetry-transport';

// Ory Kratos API utilities for Remix
//const KRATOS_BASE_URL = process.env.KRATOS_PUBLIC_URL || 'http://localhost:4433'
//let TIMEZONE = process.env.KRATOS_TIMEZONE || 'Etc/UTC';
//let LOCALE = process.env.LOCALE || 'en-US';

// Rest of your existing code...

// Corrected OpenTelemetry initialization function
function initializeOpenTelemetry() {
  try {
    logger.info('Initializing OpenTelemetry...');
    
    // Configure OpenTelemetry with correct endpoints
    const otelConfig = {
      serviceName: process.env.SERVICE_NAME || 'kratos-service',
      serviceVersion: process.env.SERVICE_VERSION || '1.0.0',
      serviceNamespace: process.env.SERVICE_NAMESPACE || 'default',
      // Use port 4317 for gRPC protocol (default for OpenTelemetry)
      endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4317',
      // Default to gRPC protocol
      protocol: process.env.OTEL_EXPORTER_OTLP_PROTOCOL || 'grpc',
      resourceAttributes: {
        'deployment.environment': process.env.NODE_ENV || 'development',
        'service.instance.id': process.env.INSTANCE_ID || '1'
      },
      // Add logging configuration
      logLevel: process.env.OTEL_LOG_LEVEL || 'info',
      // Enable console exporter for debugging during development
      enableConsoleExporter: process.env.NODE_ENV !== 'production'
    };
    
    // Check if the default export is a function
    if (typeof pinoOtelTransport === 'function') {
      // It's likely a factory function for creating a transport
      const transport = pinoOtelTransport(otelConfig);
      logger.info('Created OpenTelemetry transport');
      return true;
    } else if (pinoOtelTransport && typeof pinoOtelTransport.default === 'function') {
      // Some bundlers might not properly handle default exports
      const transport = pinoOtelTransport.default(otelConfig);
      logger.info('Created OpenTelemetry transport using nested default');
      return true;
    } else if (pinoOtelTransport && typeof pinoOtelTransport.initializeOpenTelemetry === 'function') {
      // Check if the module has the initialize method
      pinoOtelTransport.initializeOpenTelemetry(otelConfig);
      logger.info('OpenTelemetry initialized using initializeOpenTelemetry');
      return true;
    } else {
      // No known initialization method found - let's log what we have
      logger.info('OpenTelemetry transport found but no known initialization method available');
      logger.info(`Available methods: ${Object.keys(pinoOtelTransport).join(', ')}`);
      
      // Let's try to inspect what's in the default export
      if (pinoOtelTransport && typeof pinoOtelTransport === 'object') {
        for (const key in pinoOtelTransport) {
          logger.info(`Export '${key}' is type: ${typeof pinoOtelTransport[key]}`);
        }
      }
      
      return false;
    }
  } catch (error) {
    // Handle any errors during setup
    logger.warn(`OpenTelemetry integration failed: ${error.message}`);
    logger.warn('Application will continue with console logging only');
    return false;
  }
}

// Initialize OpenTelemetry
const otelEnabled = initializeOpenTelemetry();
// Try to initialize OpenTelemetry but don't fail if it doesn't work
const otelInitialized = initializeOpenTelemetry();

// Export the logger for use in other modules
export const kratosLogger = {
  logger,
  createContextLogger,
  otelEnabled: otelInitialized,
  
  // Log level convenience functions
  trace: (msg: string, obj?: object) => logger.trace(obj || {}, msg),
  debug: (msg: string, obj?: object) => logger.debug(obj || {}, msg),
  info: (msg: string, obj?: object) => logger.info(obj || {}, msg),
  warn: (msg: string, obj?: object) => logger.warn(obj || {}, msg),
  error: (msg: string, obj?: object) => logger.error(obj || {}, msg),
  fatal: (msg: string, obj?: object) => logger.fatal(obj || {}, msg),
  
  // Create a scoped logger with component information
  component: (componentName: string) => {
    return createContextLogger({ component: componentName });
  },
  
  // Create a logger for a specific operation
  operation: (operationName: string, componentName?: string) => {
    return createContextLogger({ 
      operation: operationName,
      component: componentName
    });
  }
};