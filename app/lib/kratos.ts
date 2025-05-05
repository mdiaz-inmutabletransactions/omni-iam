import { DateTime } from 'luxon';
import { inspect } from 'util';

import moment from 'moment-timezone';
import {ViteEnv as env} from "../core/ViteEnv/index"
import { logger } from '../core/Observability/logs';

const KRATOS_BASE_URL = env.KRATOS_BASE_URL;
const TIMEZONE = env.TIMEZONE 
const LOCALE = env.LOCALE 



// Create a context logger that adds metadata to each log entry
function createContextLogger(context: Record<string, any> = {}) {
  return {
    info: (msg: string | object, ...args: any[]) => {
      if (typeof msg === 'object') {
        logger.info({ ...msg, ...context }, ...args);
      } else {
        logger.info({ msg, ...context }, ...args);
      }
    },
    warn: (msg: string | object, ...args: any[]) => {
      if (typeof msg === 'object') {
        logger.warn({ ...msg, ...context }, ...args);
      } else {
        logger.warn({ msg, ...context }, ...args);
      }
    },
    error: (msg: string | object, ...args: any[]) => {
      if (typeof msg === 'object') {
        logger.error({ ...msg, ...context }, ...args);
      } else {
        logger.error({ msg, ...context }, ...args);
      }
    }
  };
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
