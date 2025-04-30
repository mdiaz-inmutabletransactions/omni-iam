// Ory Kratos API utilities for Remix
const KRATOS_BASE_URL = process.env.KRATOS_PUBLIC_URL || 'http://localhost:4433'
const TIMEZONE = process.env.KRATOS_TIMEZONE || 'UTC'
const LOCALE = process.env.LOCALE || 'en-US'

function formatTimestamp(): string {
  return new Date().toLocaleString(LOCALE, { 
    timeZone: TIMEZONE,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

const KratosConsole = {
  log: (...args: any[]) => {
    console.log(`[${formatTimestamp()}]`, ...args)
  },
  error: (...args: any[]) => {
    console.error(`[${formatTimestamp()}]`, ...args)
  }
}

// Telemetry configuration
interface TelemetryConfig {
  enabled: boolean
  serviceName?: string
  collectorEndpoint?: string
}

interface CircuitBreakerState {
  failures: number
  lastFailure: number
  testRequestTime: number
  state: 'closed' | 'open' | 'half-open'
}

export const circuitBreaker: CircuitBreakerState = {
  failures: 0,
  lastFailure: 0,
  testRequestTime: 0,
  state: 'closed'
}

const CIRCUIT_BREAKER_THRESHOLD = 5
const CIRCUIT_BREAKER_RESET_TIMEOUT = 30000 // 30 seconds

const telemetryConfig: TelemetryConfig = {
  enabled: process.env.TELEMETRY_ENABLED === 'true',
  serviceName: process.env.TELEMETRY_SERVICE_NAME || 'kratos-client',
  collectorEndpoint: process.env.TELEMETRY_COLLECTOR_ENDPOINT
}

function checkCircuitBreaker(): boolean {
  const now = Date.now()
  
  if (circuitBreaker.state === 'open') {
    if (now - circuitBreaker.lastFailure > CIRCUIT_BREAKER_RESET_TIMEOUT) {
      KratosConsole.log('[CIRCUIT BREAKER] Transitioning to half-open state')
      circuitBreaker.state = 'half-open'
      circuitBreaker.failures = 0
      circuitBreaker.testRequestTime = now
      return true // Allow one test request
    }
    return false // Still in open state
  }
  
  if (circuitBreaker.state === 'half-open') {
    // If we already have a test request in progress
    if (circuitBreaker.testRequestTime > 0) {
      if (now - circuitBreaker.testRequestTime > 5000) {
        KratosConsole.log('[CIRCUIT BREAKER] Test request timeout, returning to open state')
        circuitBreaker.state = 'open'
        circuitBreaker.lastFailure = now
        circuitBreaker.testRequestTime = 0
        return false
      }
      return false // Only allow one test request at a time
    }
    // Mark this as the test request
    circuitBreaker.testRequestTime = now
    return true
  }
  
  return true // Closed state - allow all requests
}

function updateCircuitBreaker(success: boolean): void {
  const now = Date.now()
  
  if (success) {
    if (circuitBreaker.state === 'half-open') {
      KratosConsole.log('[CIRCUIT BREAKER] Test request succeeded, closing circuit')
      circuitBreaker.state = 'closed'
      circuitBreaker.testRequestTime = 0
    }
    circuitBreaker.failures = 0
  } else {
    circuitBreaker.failures++
    circuitBreaker.lastFailure = now
    
    if (circuitBreaker.state === 'half-open') {
      KratosConsole.log('[CIRCUIT BREAKER] Test request failed, reopening circuit')
      circuitBreaker.state = 'open'
      circuitBreaker.testRequestTime = 0
    } else if (circuitBreaker.failures >= CIRCUIT_BREAKER_THRESHOLD) {
      KratosConsole.log('[CIRCUIT BREAKER] Failure threshold reached, opening circuit')
      circuitBreaker.state = 'open'
    }
  }
}

// Tracing utilities
const tracer = {
  startSpan: (name: string, correlationId?: string) => {
    if (!telemetryConfig.enabled) return { end: () => {} }
    
    const spanId = correlationId || generateCorrelationId()
    let spanActive = true
    
    // Fallback span that still maintains basic functionality
    const fallbackSpan = {
      end: () => {
        console.log(`[TRACE] End ${name} (${spanId}) (fallback)`)
        spanActive = false
      },
      addAttribute: () => {},
      id: spanId
    }

    try {
        KratosConsole.log(`[TRACE] Start ${name} (${spanId})`)
      return {
        end: () => {
          if (spanActive) {
            KratosConsole.log(`[TRACE] End ${name} (${spanId})`)
            spanActive = false
          }
        },
        addAttribute: (key: string, value: any) => {
          if (spanActive) {
            KratosConsole.log(`[TRACE] ${name} (${spanId}) - ${key}: ${JSON.stringify(value)}`)
          }
        },
        id: spanId
      }
    } catch (err) {
      KratosConsole.error('[TRACING] Failed to create span, using fallback:', err)
      return fallbackSpan
    }
  },
  recordException: (error: Error) => {
    if (!telemetryConfig.enabled) return
    
    try {
      KratosConsole.error('[TELEMETRY] Exception:', error)
    } catch (err) {
      KratosConsole.error('[TELEMETRY] Failed to record exception:', err)
    }
  },
  healthCheck: async () => {
    if (!telemetryConfig.enabled) return true
    
    try {
      if (telemetryConfig.collectorEndpoint) {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 2000)
        
        try {
          const response = await fetch(`${telemetryConfig.collectorEndpoint}/health`, {
            signal: controller.signal
          })
          clearTimeout(timeout)
          return response.ok
        } catch {
          clearTimeout(timeout)
          return false
        }
      }
      return true // Local logging is always available
    } catch {
      return false
    }
  }
}

// Generate a unique correlation ID
const generateCorrelationId = () => {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15)
}

// Common headers for Kratos API requests
const kratosHeaders = {
  'Accept': 'application/json',
  'Content-Type': 'application/json',
  credentials: 'include' as const,
  'X-Correlation-ID': generateCorrelationId()
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
type ResponseMiddleware<T = any> = (response: Response) => Promise<T>

// Debug logging middleware
const debugLoggingMiddleware = {
  request: (): RequestMiddleware => (url, options) => {
    console.groupCollapsed(`Kratos API Request: ${options.method || 'GET'} ${url}`)
    console.log('Request Headers:', options.headers)
    if (options.body) {
      try {
        console.log('Request Payload:', JSON.parse(options.body as string))
      } catch {
        console.log('Request Payload:', options.body)
      }
    }
    console.groupEnd()
    return [url, options]
  },
  response: <T>(): ResponseMiddleware<T> => async (response) => {
    const clone = response.clone()
    const clientCorrelationId = response.headers.get('X-Correlation-ID') || 'none'
    const serverCorrelationId = response.headers.get('Set-Correlation-ID') || 'none'
    console.groupCollapsed(`Kratos API Response: ${response.status} ${response.url}`)
    console.log('Client Correlation ID (X-Correlation-ID):', clientCorrelationId)
    console.log('Server Correlation ID (Set-Correlation-ID):', serverCorrelationId)
    console.log('Response Headers:', Object.fromEntries(clone.headers.entries()))
    try {
      const data = await clone.json()
      console.log('Response Payload:', data)
      console.groupEnd()
      return {
        ...data,
        _metadata: {
          correlationId: serverCorrelationId,
          requestId: clientCorrelationId,
          headers: Object.fromEntries(response.headers.entries())
        }
      }
    } catch (err) {
      console.log('Response Payload: [non-JSON]', await clone.text())
      console.groupEnd()
      throw err
    }
  }
}

// Generic Kratos fetch wrapper with middleware and telemetry support
const MAX_RETRIES = 3
const INITIAL_RETRY_DELAY = 1000 // 1 second

async function kratosFetch<T = any>(
  endpoint: string,
  options: RequestInit = {},
  middlewares?: {
    request?: RequestMiddleware[]
    response?: ResponseMiddleware<T>[]
  },
  debug = false,
  retryCount = 0
): Promise<T> {
  // Check circuit breaker state
  if (!checkCircuitBreaker()) {
    throw new Error('Service unavailable (circuit breaker open)')
  }

  const span = tracer.startSpan(`kratosFetch:${endpoint}`)
  span?.addAttribute?.('method', options.method || 'GET')
  span?.addAttribute?.('url', endpoint)

  try {
    // Add debug middleware if enabled
    if (debug) {
      middlewares = {
        request: [...(middlewares?.request || []), debugLoggingMiddleware.request()],
        response: [...(middlewares?.response || []), debugLoggingMiddleware.response<T>()]
      }
    }
    let url = `${KRATOS_BASE_URL}${endpoint}`
  const correlationId = generateCorrelationId()
  let requestOptions: RequestInit = {
    ...options,
    headers: {
      ...kratosHeaders,
      ...options.headers,
      'X-Correlation-ID': correlationId
    }
  }

  // Apply request middleware
  if (middlewares?.request) {
    for (const middleware of middlewares.request) {
      ;[url, requestOptions] = middleware(url, requestOptions)
    }
  }

  const response = await fetch(url, requestOptions)

  if (!response.ok) {
    throw await parseKratosError(response)
  }

  // Apply response middleware if provided
  if (middlewares?.response) {
    for (const middleware of middlewares.response) {
      return await middleware(response)
    }
  }

    const data = await response.json()
    // Mirror the cookie pattern: client sends X-Correlation-ID, server responds with Set-Correlation-ID
    const serverCorrelationId = response.headers.get('Set-Correlation-ID') || correlationId
    span?.addAttribute?.('status', response.status)
    span?.addAttribute?.('correlationId', serverCorrelationId)
    span?.end?.()
    
    return {
      ...data,
      _metadata: {
        correlationId: serverCorrelationId,
        requestId: correlationId,
        headers: Object.fromEntries(response.headers.entries())
      }
    }
  } catch (error) {
    span?.addAttribute?.('error', (error as Error).message)
    tracer.recordException(error as Error)
    span?.end?.()

    // Update circuit breaker
    updateCircuitBreaker(false)

    // Retry for network errors or 5xx responses
    const shouldRetry = (error instanceof TypeError || // Network error
                        (error as KratosError)?.error?.code >= 500) && 
                       retryCount < MAX_RETRIES

    if (shouldRetry) {
      const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount)
      await new Promise(resolve => setTimeout(resolve, delay))
      return kratosFetch<T>(endpoint, options, middlewares, debug, retryCount + 1)
    }

    throw error
  }
}

// Initialize a login flow
export async function initLoginFlow(debug = false): Promise<KratosFlow> {
  return kratosFetch('/self-service/login/browser', {}, undefined, debug)
}

// Initialize a registration flow
export async function initRegistrationFlow(debug = false): Promise<KratosFlow> {
  return kratosFetch('/self-service/registration/browser', {}, undefined, debug)
}

// Submit login form
export async function submitLogin(flowId: string, body: any, debug = false): Promise<any> {
  try {
    return await kratosFetch(`/self-service/login?flow=${flowId}`, {
      method: 'POST',
      body: JSON.stringify(body)
    }, undefined, debug)
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw error
    }
    if (typeof error === 'object' && error !== null && 'error' in error) {
      const kratosError = error as { error?: { message?: string } }
      throw new Error(kratosError.error?.message || 'Unknown error')
    }
    throw new Error('Unknown error')
  }
}

// Error handling
async function parseKratosError(response: Response): Promise<KratosError> {
  try {
    const error = await response.json()
    console.groupCollapsed(`Kratos API Error: ${response.status} ${response.url}`)
    console.log('Error Response:', error)
    console.log('Response Headers:', Object.fromEntries(response.headers.entries()))
    console.groupEnd()
    return {
      error: {
        code: response.status,
        message: error.error?.message || 'Unknown error',
        reason: error.error?.reason || 'unknown_reason'
      }
    }
  } catch (err) {
    console.groupCollapsed(`Kratos API Parse Error: ${response.status} ${response.url}`)
    console.log('Raw Response:', await response.text())
    console.log('Error:', err)
    console.groupEnd()
    return {
      error: {
        code: response.status,
        message: 'Failed to parse error response',
        reason: 'parse_error'
      }
    }
  }
}
