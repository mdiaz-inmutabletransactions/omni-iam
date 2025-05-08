// app/lib/kratos.ts - update to use Observability

import { ViteEnv } from "../core/ViteEnv/index";
// Import the logging components from Observability
import { 
  logger,
  redactSensitiveInfo,
  createComponentLogger,
  createOperationLogger,
} from '../core/Observability';

const KRATOS_BASE_URL = ViteEnv.KRATOS_BASE_URL;

// Create component loggers (synchronous)
const kratosLogger = createComponentLogger('KratosService');



// Helper function to create operation loggers (synchronous)
function getOperationLogger(operation: string, requestId: string = crypto.randomUUID(), context: Record<string, any> = {}) {
  // Use logger.child directly instead of createOperationLogger if it returns a Promise
  return logger.child({
    operation: operation,
    requestId,
    'event.name': operation,
    'code.function': operation,
    component: 'KratosService',
    ...context
  });
}

// Types for Kratos responses (keep these as they are)
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

// Common headers for Kratos API requests
const kratosHeaders = {
  'Accept': 'application/json',
  'Content-Type': 'application/json',
  credentials: 'include' as const,
}

// Debug logging middleware using Observability
const debugLoggingMiddleware = {
  request: (requestId: string = crypto.randomUUID()) => (url: string, options: RequestInit): [string, RequestInit] => {
    // Create an operation-specific logger for this request
    const requestLogger =  getOperationLogger('kratos-request', requestId, {
      method: options.method || 'GET',
      url,
      'http.method': options.method || 'GET',
      'http.url': url,
      'http.request_id': requestId
    });

    // Log at INFO level
    requestLogger.info({
      msg: 'Kratos API Request',
      headers: redactSensitiveInfo(options.headers),
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
  
  response: <T>(requestId: string = crypto.randomUUID()) => async (response: Response): Promise<Response> => {
    const clone = response.clone();
    const clientCorrelationId = response.headers.get('X-Correlation-ID') || requestId;
    const serverCorrelationId = response.headers.get('Set-Correlation-ID') || 'none';
    
    // Create a response-specific logger
    const responseLogger =  getOperationLogger('kratos-response', clientCorrelationId, {
      correlationId: serverCorrelationId,
      status: response.status,
      url: response.url,
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
    
    // Log at INFO level
    responseLogger.info({
      msg: `Kratos API Response ${response.ok ? '(Success)' : '(Error)'}`,
      headers: Object.fromEntries(clone.headers.entries()),
      body: redactSensitiveInfo(responseBody)
    });

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
    request?: Array<(url: string, options: RequestInit) => [string, RequestInit]>
    response?: Array<(response: Response) => Promise<T | Response>>
  },
  debug = true,
  retryCount = 0
): Promise<T> {
  const requestId = crypto.randomUUID();
  // Use a synchronous operation logger
  const requestLogger =  getOperationLogger('kratos-fetch', requestId, {
    endpoint,
    retry: retryCount
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
  // Use a synchronous operation logger
  const flowLogger =  getOperationLogger('init-login-flow', requestId, {
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
  // Use a synchronous operation logger
  const flowLogger =  getOperationLogger('init-registration-flow', requestId, {
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
  // Use a synchronous operation logger
  const loginLogger =  getOperationLogger('submit-login', requestId, { 
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
  // Use a synchronous error-specific logger
  const errorLogger = await getOperationLogger('kratos-error', requestId, { 
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