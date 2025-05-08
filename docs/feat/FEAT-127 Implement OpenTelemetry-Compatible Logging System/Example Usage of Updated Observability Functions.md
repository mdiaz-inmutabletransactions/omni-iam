# Example Usage of Updated Observability Functions

Let me create comprehensive examples showing how to use the updated logging functions in different scenarios. I'll demonstrate both basic and advanced use cases:

```typescript
// examples/observability-examples.ts

import { 
  logger, 
  createComponentLogger, 
  createOperationLogger, 
  createRequestLogger,
  createEventLogger,
  createMetricLogger,
  createSessionLogger,
  logError,
  getTraceparentHeader,
  createSpanContext,
  toOtelLogRecord,
  redactSensitiveInfo
} from '../core/Observability';

/**
 * Basic Logging Examples
 */
function basicLoggingExamples() {
  console.log('--- Basic Logging Examples ---');
  
  // Using the global logger directly
  logger.info('Simple info message');
  logger.debug({ message: 'Debug with object structure', data: { key: 'value' } });
  
  // With additional attributes at log time
  logger.info('Info with attributes', { userId: '123', action: 'login' });
  
  // Error logging
  try {
    throw new Error('Example error');
  } catch (error) {
    logger.error({ message: 'Something went wrong', error });
  }
  
  // Using OpenTelemetry-style structured logging
  logger.info({
    body: 'Structured log with OpenTelemetry format',
    attributes: {
      'user.id': '123',
      'service.name': 'auth-service'
    }
  });
}

/**
 * Component Logger Examples
 */
function componentLoggerExamples() {
  console.log('--- Component Logger Examples ---');
  
  // Create a component logger
  const userServiceLogger = createComponentLogger('UserService', {
    version: '1.0.0',
    environment: 'production'
  });
  
  // Basic usage
  userServiceLogger.info('User service initialized');
  
  // With additional attributes
  userServiceLogger.debug('Processing request', { 
    requestId: '123abc', 
    endpoint: '/users/profile' 
  });
  
  // Log an error in the component context
  try {
    // Simulate an error
    throw new Error('Database connection failed');
  } catch (error) {
    userServiceLogger.error({
      message: 'Failed to connect to database',
      error,
      dbHost: 'db.example.com'
    });
  }
  
  // Create another component with child component
  const authServiceLogger = createComponentLogger('AuthService');
  
  // Create a child component for a specific subsystem
  const tokenManagerLogger = authServiceLogger.child({
    subcomponent: 'TokenManager'
  });
  
  tokenManagerLogger.info('Token validation succeeded', { 
    tokenType: 'refresh',
    expiresIn: 3600
  });
}

/**
 * Operation Logger Examples
 */
function operationLoggerExamples() {
  console.log('--- Operation Logger Examples ---');
  
  // Create a logger for a specific operation with auto-generated requestId
  const loginOperationLogger = createOperationLogger('user.login');
  
  // Log the start of the operation
  loginOperationLogger.info({
    message: 'Login operation started',
    username: 'john.doe@example.com',
    clientIp: '192.168.1.1'
  });
  
  // Log a successful outcome
  loginOperationLogger.info({
    message: 'Login successful',
    userId: '12345',
    permissions: ['read', 'write'],
    'event.outcome': 'success'
  });
  
  // Create a logger for a different operation with explicit requestId
  const requestId = crypto.randomUUID();
  const paymentOperationLogger = createOperationLogger('payment.process', requestId, {
    paymentProvider: 'stripe',
    paymentMethod: 'credit_card'
  });
  
  // Log the operation steps
  paymentOperationLogger.info('Payment validation started');
  paymentOperationLogger.info('Payment validated successfully');
  
  // Simulating an error
  try {
    throw new Error('Insufficient funds');
  } catch (error) {
    paymentOperationLogger.error({
      message: 'Payment processing failed',
      error,
      errorCode: 'INSUFFICIENT_FUNDS',
      'event.outcome': 'failure'
    });
  }
  
  // The operation logs will share the same requestId for correlation
  console.log(`All payment operation logs share requestId: ${requestId}`);
}

/**
 * HTTP Request Logger Examples
 */
async function requestLoggerExamples() {
  console.log('--- HTTP Request Logger Examples ---');
  
  // Create a mock Request object
  const request = new Request('https://api.example.com/users/profile', {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'application/json',
      'X-Request-ID': 'req-123-abc',
      'Authorization': 'Bearer token123'
    }
  });
  
  // Create a logger for the request
  const reqLogger = createRequestLogger(request, {
    customField: 'value'
  });
  
  // Log request processing steps
  reqLogger.info('Request received');
  reqLogger.debug('Authenticating request');
  reqLogger.info('Authentication successful');
  reqLogger.debug('Processing request body');
  
  // Simulate async processing
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Log request completion
  reqLogger.info({
    message: 'Request handled successfully',
    statusCode: 200,
    responseTime: 97.3,
    'http.status_code': 200
  });
  
  // Create a W3C traceparent for outgoing requests
  const traceparent = getTraceparentHeader();
  console.log(`Outgoing request traceparent: ${traceparent}`);
}

/**
 * Event Logger Examples
 */
function eventLoggerExamples() {
  console.log('--- Event Logger Examples ---');
  
  // Create an event logger for authentication domain
  const authEvents = createEventLogger('auth', {
    service: 'identity-service'
  });
  
  // Log different types of events
  authEvents.event('user.signin', { 
    userId: '12345', 
    method: 'password',
    success: true
  });
  
  authEvents.event('user.password_changed', {
    userId: '12345',
    forced: false,
    source: 'user-settings'
  });
  
  // Log operation lifecycle events
  authEvents.start('session.refresh', { sessionId: 'sess-abc-123' });
  // ...perform operation...
  authEvents.success('session.refresh', { 
    sessionId: 'sess-abc-123',
    newExpiryTime: new Date(Date.now() + 3600 * 1000).toISOString()
  });
  
  // Log a failure
  try {
    throw new Error('Invalid token format');
  } catch (error) {
    authEvents.failure('token.validate', error, {
      tokenId: 'tok-xyz-789',
      tokenType: 'access'
    });
  }
}

/**
 * Metric Logger Examples
 */
function metricLoggerExamples() {
  console.log('--- Metric Logger Examples ---');
  
  // Create a metric logger
  const metrics = createMetricLogger({
    service: 'api-gateway'
  });
  
  // Log counter metrics
  metrics.counter('http.requests.total', 1, {
    method: 'GET',
    path: '/users',
    status: 200
  });
  
  // Log gauge metrics
  metrics.gauge('system.memory.usage', 75.5, {
    unit: 'percent'
  });
  
  metrics.gauge('active.users', 1250);
  
  // Log histogram metrics
  metrics.histogram('http.request.duration', 235.6, {
    method: 'POST',
    path: '/orders',
    unit: 'ms'
  });
  
  // Use a timer
  const timer = metrics.startTimer('database.query.duration');
  // ... perform database query ...
  setTimeout(() => {
    // Stop timer and log duration
    const duration = timer.stop({
      table: 'users',
      operation: 'SELECT',
      indexUsed: true
    });
    console.log(`Query took ${duration.toFixed(2)}ms`);
  }, 50);
}

/**
 * Session Logger Examples
 */
function sessionLoggerExamples() {
  console.log('--- Session Logger Examples ---');
  
  // Create a session logger
  const sessionId = `sess-${crypto.randomUUID()}`;
  const userId = 'user-12345';
  
  const sessionLogger = createSessionLogger(sessionId, userId, {
    ipAddress: '203.0.113.42',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });
  
  // Log session lifecycle events
  sessionLogger.info('Session created');
  
  sessionLogger.info('User preferences loaded', {
    theme: 'dark',
    language: 'en-US'
  });
  
  // Log session activity
  sessionLogger.info('Page viewed', {
    page: '/dashboard',
    referrer: '/login'
  });
  
  sessionLogger.warn('Failed feature access attempt', {
    feature: 'admin-panel',
    reason: 'insufficient-permissions'
  });
  
  // Log session end
  sessionLogger.info('Session terminated', {
    reason: 'user-logout',
    duration: 1200 // seconds
  });
}

/**
 * Error Handling Examples
 */
function errorHandlingExamples() {
  console.log('--- Error Handling Examples ---');
  
  // Basic error logging
  try {
    throw new Error('Something went wrong');
  } catch (error) {
    logError(error, {
      component: 'ErrorExample',
      operation: 'demonstration',
      userId: '12345'
    });
  }
  
  // Custom error with additional properties
  class PaymentError extends Error {
    constructor(
      message: string, 
      public code: string, 
      public paymentId: string
    ) {
      super(message);
      this.name = 'PaymentError';
    }
  }
  
  try {
    throw new PaymentError(
      'Payment authorization failed', 
      'AUTH_FAILED', 
      'pmt-abc-123'
    );
  } catch (error) {
    // The logger will automatically extract the error properties
    logger.error({
      message: 'Payment processing error',
      error,
      customer: 'cust-xyz-789'
    });
  }
  
  // Error with sensitive information
  try {
    const sensitiveData = {
      cardNumber: '4111-1111-1111-1111',
      cvv: '123',
      password: 'secret123',
      user: {
        email: 'test@example.com',
        apiKey: 'ak_123456789'
      }
    };
    
    throw new Error(`Processing failed for card ${sensitiveData.cardNumber}`);
  } catch (error) {
    // Use redactSensitiveInfo to sanitize the error
    const redactedError = {
      ...error,
      message: redactSensitiveInfo(error.message),
    };
    
    logger.error({
      message: 'Payment processing error with sensitive data',
      error: redactedError,
      // This data will be automatically redacted
      sensitiveContext: {
        cardInfo: {
          last4: '1111',
          token: 'tok_visa_4111', 
          expiryDate: '12/25'
        }
      }
    });
  }
}

/**
 * Advanced OpenTelemetry Examples
 */
function advancedOtelExamples() {
  console.log('--- Advanced OpenTelemetry Examples ---');
  
  // Create a span context for distributed tracing
  const span = createSpanContext('process-order', {
    'order.id': 'ord-123-abc',
    'customer.id': 'cust-456-def'
  });
  
  // Log with explicit trace context
  logger.info({
    message: 'Processing order',
    orderId: 'ord-123-abc',
    // Include trace context explicitly
    trace_id: span.trace_id,
    span_id: span.span_id,
    trace_flags: span.trace_flags
  });
  
  // Create a complete OTel-compatible log record
  const otelLog = toOtelLogRecord('info', 'Order processed successfully', {
    'order.id': 'ord-123-abc',
    'processing.time': 342.5,
    'items.count': 5
  });
  
  console.log('OpenTelemetry Log Record:', otelLog);
  
  // Log it directly
  logger.info(otelLog);
}

/**
 * Run all examples
 */
async function runAllExamples() {
  console.log('=== Starting Observability Examples ===');
  
  basicLoggingExamples();
  componentLoggerExamples();
  operationLoggerExamples();
  await requestLoggerExamples();
  eventLoggerExamples();
  metricLoggerExamples();
  sessionLoggerExamples();
  errorHandlingExamples();
  advancedOtelExamples();
  
  console.log('=== Observability Examples Complete ===');
}

// Run the examples
runAllExamples().catch(console.error);
```

## Example for Real-World Application: Authentication Service

Now let's create a more practical example showing how to use the updated logging in a real Remix application route for user authentication:

```typescript
// app/routes/auth.login.tsx
import { json, redirect, type ActionFunction, type LoaderFunction } from "@remix-run/node";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { z } from "zod";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { 
  createComponentLogger, 
  createOperationLogger, 
  createRequestLogger, 
  createEventLogger,
  createMetricLogger,
  logError
} from "~/core/Observability";

// Create component logger for this route
const logger = createComponentLogger("AuthLoginRoute");
const authEvents = createEventLogger("auth");
const metrics = createMetricLogger();

// Create zod schema for login validation
const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  redirectTo: z.string().optional()
});

export const loader: LoaderFunction = async ({ request }) => {
  // Create request-specific logger
  const reqLogger = createRequestLogger(request, { route: "auth.login" });
  
  reqLogger.info("Login page visited");
  
  // Check if user is already logged in
  try {
    const session = await getSession(request.headers.get("Cookie"));
    const userId = session.get("userId");
    
    if (userId) {
      reqLogger.info("Already authenticated user visited login page", { userId });
      
      // Track this as a business metric
      metrics.counter("auth.login.already_authenticated", 1);
      
      return redirect("/dashboard");
    }
    
    // Extract URL parameters
    const url = new URL(request.url);
    const redirectTo = url.searchParams.get("redirectTo") || "/dashboard";
    
    reqLogger.debug("Login page rendered", { redirectTo });
    
    return json({ redirectTo });
  } catch (error) {
    // Log the error with context
    logError(error, { 
      route: "auth.login", 
      handler: "loader",
      url: request.url
    });
    
    // Return minimal error to client
    return json({ error: "An unexpected error occurred" }, { status: 500 });
  }
};

export const action: ActionFunction = async ({ request }) => {
  // Create operation-specific logger with unique request ID
  const requestId = crypto.randomUUID();
  const operationLogger = createOperationLogger("auth.login.submit", requestId, {
    route: "auth.login"
  });
  
  // Start a timer for performance measurement
  const timer = metrics.startTimer("auth.login.duration");
  
  try {
    operationLogger.info("Login form submitted");
    
    // Parse form data
    const formData = await request.formData();
    const rawData = Object.fromEntries(formData);
    
    operationLogger.debug("Validating login credentials");
    
    // Validate with zod
    const result = loginSchema.safeParse(rawData);
    
    if (!result.success) {
      // Validation failed
      const errors = result.error.flatten();
      
      operationLogger.warn("Login validation failed", { 
        errors: errors.fieldErrors,
        email: rawData.email
      });
      
      // Track validation failures
      metrics.counter("auth.login.validation_failure", 1, {
        email_error: !!errors.fieldErrors.email,
        password_error: !!errors.fieldErrors.password
      });
      
      // Log event
      authEvents.event("login.validation_failed", {
        requestId,
        email: rawData.email,
        errors: errors.fieldErrors
      });
      
      // Stop the timer
      timer.stop({ outcome: "validation_failure" });
      
      return json({ errors: errors.fieldErrors });
    }
    
    // Validation succeeded
    const { email, password, redirectTo } = result.data;
    
    operationLogger.info("Login credentials validation passed", { 
      email, 
      redirectTo: redirectTo || "/dashboard" 
    });
    
    // Authenticate user (replace with your actual auth logic)
    operationLogger.debug("Attempting user authentication");
    const { success, userId, error } = await authenticateUser(email, password);
    
    if (!success) {
      operationLogger.warn("Authentication failed", { 
        email, 
        reason: error 
      });
      
      // Track failed logins
      metrics.counter("auth.login.failure", 1, {
        reason: error
      });
      
      // Log event
      authEvents.event("login.failed", {
        requestId,
        email,
        reason: error
      });
      
      // Stop the timer
      timer.stop({ outcome: "auth_failure" });
      
      return json({ errors: { form: error || "Invalid email or password" } });
    }
    
    // Authentication succeeded
    operationLogger.info("Authentication successful", { 
      userId, 
      email 
    });
    
    // Create session
    const session = await getSession();
    session.set("userId", userId);
    
    // Track successful logins
    metrics.counter("auth.login.success", 1);
    
    // Log event
    authEvents.event("login.success", {
      requestId,
      userId,
      email
    });
    
    // Stop the timer
    const duration = timer.stop({ outcome: "success" });
    operationLogger.info(`Login processed in ${duration.toFixed(2)}ms`);
    
    return redirect(redirectTo || "/dashboard", {
      headers: {
        "Set-Cookie": await commitSession(session)
      }
    });
  } catch (error) {
    // Log the error with context
    logError(error, { 
      operation: "auth.login.submit", 
      requestId
    });
    
    // Track unexpected errors
    metrics.counter("auth.login.error", 1, {
      error_type: error instanceof Error ? error.name : "unknown"
    });
    
    // Log event
    authEvents.failure("login", error, {
      requestId
    });
    
    // Stop the timer
    timer.stop({ outcome: "error" });
    
    // Return minimal error to client
    return json({ errors: { form: "An unexpected error occurred" } }, { status: 500 });
  }
};

// Mock authentication function (replace with your actual implementation)
async function authenticateUser(email: string, password: string) {
  // In a real implementation, this would check against a database
  if (email === "admin@example.com" && password === "password123") {
    return { success: true, userId: "user-123" };
  }
  return { success: false, error: "Invalid email or password" };
}

// Mock session functions (replace with your actual implementation)
async function getSession(cookie?: string | null) {
  // This would use your actual session implementation
  return { get: (key: string) => null };
}

async function commitSession(session: any) {
  // This would use your actual session implementation
  return "session-cookie=123; Path=/; HttpOnly; SameSite=Lax";
}

// Component for the login page
export default function LoginPage() {
  const loaderData = useLoaderData<{ redirectTo?: string }>();
  const actionData = useActionData<{ errors?: Record<string, string[]> }>();
  
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md space-y-8 p-6 bg-white shadow-md rounded-lg">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Login</h1>
          <p className="text-gray-600">Sign in to your account</p>
        </div>
        
        <Form method="post" className="space-y-6">
          <input 
            type="hidden" 
            name="redirectTo" 
            value={loaderData?.redirectTo || ''} 
          />
          
          {actionData?.errors?.form && (
            <div className="p-3 text-sm bg-red-50 text-red-700 rounded">
              {actionData.errors.form}
            </div>
          )}
          
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input 
              id="email" 
              name="email" 
              type="email" 
              required 
              autoComplete="email"
              aria-invalid={actionData?.errors?.email ? true : undefined}
              aria-describedby={actionData?.errors?.email ? "email-error" : undefined}
            />
            {actionData?.errors?.email && (
              <p className="text-sm text-red-600" id="email-error">
                {actionData.errors.email}
              </p>
            )}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input 
              id="password" 
              name="password" 
              type="password" 
              required 
              autoComplete="current-password"
              aria-invalid={actionData?.errors?.password ? true : undefined}
              aria-describedby={actionData?.errors?.password ? "password-error" : undefined}
            />
            {actionData?.errors?.password && (
              <p className="text-sm text-red-600" id="password-error">
                {actionData.errors.password}
              </p>
            )}
          </div>
          
          <Button type="submit" className="w-full">
            Sign in
          </Button>
        </Form>
        
        <div className="text-center text-sm">
          <a href="/auth/reset-password" className="text-blue-600 hover:underline">
            Forgot your password?
          </a>
          <div className="mt-2">
            <a href="/auth/register" className="text-blue-600 hover:underline">
              Create an account
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
```

These examples demonstrate:

1. Component-level logging for the entire route
2. Operation-specific logging for the login action
3. Request-specific logging for the loader
4. Structured event logging for authentication events
5. Metrics collection for performance and business metrics
6. Proper error handling with context
7. Integration with zod validation
8. OpenTelemetry compatible log records

The logging in this example provides comprehensive visibility into the authentication flow while following modern observability practices.