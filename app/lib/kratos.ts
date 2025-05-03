import { DateTime } from 'luxon';
import { inspect } from 'util';
import pino from 'pino';
import pino1 from 'pino';
import  pretty from 'pino-pretty';
import moment from 'moment-timezone';

// Ory Kratos API utilities for Remix
const KRATOS_BASE_URL = process.env.KRATOS_PUBLIC_URL || 'http://localhost:4433'
let TIMEZONE = process.env.KRATOS_TIMEZONE || 'Etc/UTC';
let LOCALE = process.env.LOCALE || 'en-US';

// Format timestamp for logs - with better error handling
function formatTimestamp(): string {
  try {
 
    let timezone = TIMEZONE;
     
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
      //delete context.level;
      //delete context.time;
      //delete context.pid;
      //delete context.hostname;
      //delete context.msg;
      
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


const logger = pino(
  {
    level: process.env.LOG_LEVEL || 'debug',
    timestamp: () => `,"time":"${formatTimestamp()}"`,
    base: {
      pid: process.pid.toString(),
      hostname: process.env.HOSTNAME || 'localhost',
      que:"kjdkjslkdjlksdj"
      
    },
    formatters: {
      level(label) {
        return { level: label };
      },
    },
  }, 
  consoleTransport)

function validateEnv() {

  try {
    // Validate timezone using moment-timezone
    const isValidTZ = moment.tz.zone(TIMEZONE);
    if (!isValidTZ) {
      throw new RangeError(`Invalid timezone: "${TIMEZONE}"`);

    }else{
      logger.info(`Timezone set to "${TIMEZONE}"`);
    }
  }
  catch (error ) {
    if (error instanceof RangeError) {
      logger.warn(`Invalid timezone: "${TIMEZONE}" — falling back to "Etc/UTC".`);
      logger.warn(`It should be a valid IANA time zone identifier. See:`);      
      logger.warn(`- https://en.wikipedia.org/wiki/List_of_tz_database_time_zones`);
      logger.warn(`- https://momentjs.com/timezone/`);    
      logger.warn("");
      process.env.KRATOS_TIMEZONE = TIMEZONE;
    }
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
