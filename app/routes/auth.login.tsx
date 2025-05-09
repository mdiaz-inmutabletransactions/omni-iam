// app/routes/auth.login.tsx
import { json, redirect, type ActionFunction, type LoaderFunction } from "@remix-run/node";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { z } from "zod";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { 
  logger,
  createComponentLogger, 
  createOperationLogger, 
  createRequestLogger,
  getTraceContext,
  setTraceContext
} from "~/core/Observability";

// Create component logger for this route
const routeLogger = createComponentLogger("AuthLoginRoute");

// Create zod schema for login validation
const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  redirectTo: z.string().optional()
});

export const loader: LoaderFunction = async ({ request }) => {
  // Create request-specific logger with the HTTP context
  // This will extract trace context from the request headers if available
  const reqLogger = await createRequestLogger(request, { route: "auth.login" });
  
  // Get the current trace context
  const traceContext = getTraceContext();
  
  reqLogger.info("Login page visited");
  
  try {
    const session = await getSession(request.headers.get("Cookie"));
    const userId = session.get("userId");
    
    if (userId) {
      reqLogger.info("Already authenticated user visited login page", { userId });
      
      // Track this as a business metric - use the same trace context
      const metrics = logger.child({
        'telemetry.type': 'metric',
        // Use the standardized trace context field names
        trace_id: traceContext.traceId,
        span_id: traceContext.spanId,
        trace_flags: traceContext.traceFlags
      });
      
      metrics.info({
        'metric.name': "auth.login.already_authenticated",
        'metric.type': 'counter',
        'metric.value': 1
      });
      
      return redirect("/dashboard");
    }
    
    // Extract URL parameters
    const url = new URL(request.url);
    const redirectTo = url.searchParams.get("redirectTo") || "/dashboard";
    
    reqLogger.debug("Login page rendered", { redirectTo });
    
    return json({ redirectTo });
  } catch (error) {
    // Log the error with context
    reqLogger.error({
      message: "An unexpected error occurred",
      error,
      route: "auth.login", 
      handler: "loader",
      url: request.url
    });
    
    // Return minimal error to client
    return json({ error: "An unexpected error occurred" }, { status: 500 });
  }
};

export const action: ActionFunction = async ({ request }) => {
  // Generate a unique request ID
  const requestId = crypto.randomUUID();
  
  // Create operation-specific logger
  const operationLogger = createOperationLogger("auth.login.submit", requestId, {
    route: "auth.login"
  });
  
  // Start a timer for performance measurement
  const startTime = performance.now();
  
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
      // Create metrics logger that inherits the trace context from operationLogger
      const metrics = logger.child({
        'telemetry.type': 'metric',
        // Use the same trace context
        trace_id: getTraceContext().traceId,
        span_id: getTraceContext().spanId,
        trace_flags: getTraceContext().traceFlags
      });
      
      metrics.info({
        'metric.name': "auth.login.validation_failure",
        'metric.type': 'counter',
        'metric.value': 1,
        email_error: !!errors.fieldErrors.email,
        password_error: !!errors.fieldErrors.password
      });
      
      // Create event logger with same trace context
      const events = logger.child({
        'event.domain': 'auth',
        requestId,
        // Use the same trace context
        trace_id: getTraceContext().traceId,
        span_id: getTraceContext().spanId,
        trace_flags: getTraceContext().traceFlags
      });
      
      // Log event
      events.info({
        'event.name': "login.validation_failed",
        requestId,
        email: rawData.email,
        errors: errors.fieldErrors
      });
      
      // Log performance
      const duration = performance.now() - startTime;
      metrics.info({
        'metric.name': "auth.login.duration",
        'metric.type': 'histogram',
        'metric.value': duration,
        'metric.unit': 'ms',
        outcome: "validation_failure"
      });
      
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
      
      // Track failed logins with consistent trace context
      const metrics = logger.child({
        'telemetry.type': 'metric',
        trace_id: getTraceContext().traceId,
        span_id: getTraceContext().spanId,
        trace_flags: getTraceContext().traceFlags
      });
      
      metrics.info({
        'metric.name': "auth.login.failure",
        'metric.type': 'counter',
        'metric.value': 1,
        reason: error
      });
      
      // Log event with consistent trace context
      const events = logger.child({
        'event.domain': 'auth',
        requestId,
        trace_id: getTraceContext().traceId,
        span_id: getTraceContext().spanId,
        trace_flags: getTraceContext().traceFlags
      });
      
      events.info({
        'event.name': "login.failed",
        requestId,
        email,
        reason: error
      });
      
      // Stop the timer and log duration
      const duration = performance.now() - startTime;
      metrics.info({
        'metric.name': "auth.login.duration",
        'metric.type': 'histogram',
        'metric.value': duration,
        'metric.unit': 'ms',
        outcome: "auth_failure"
      });
      
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
    
    // Track successful logins with consistent trace context
    const metrics = logger.child({
      'telemetry.type': 'metric',
      trace_id: getTraceContext().traceId,
      span_id: getTraceContext().spanId,
      trace_flags: getTraceContext().traceFlags
    });
    
    metrics.info({
      'metric.name': "auth.login.success",
      'metric.type': 'counter',
      'metric.value': 1
    });
    
    // Log event with consistent trace context
    const events = logger.child({
      'event.domain': 'auth',
      requestId,
      trace_id: getTraceContext().traceId,
      span_id: getTraceContext().spanId,
      trace_flags: getTraceContext().traceFlags
    });
    
    events.info({
      'event.name': "login.success",
      requestId,
      userId,
      email
    });
    
    // Stop the timer and log duration
    const duration = performance.now() - startTime;
    metrics.info({
      'metric.name': "auth.login.duration",
      'metric.type': 'histogram',
      'metric.value': duration,
      'metric.unit': 'ms',
      outcome: "success"
    });
    
    operationLogger.info(`Login processed in ${duration.toFixed(2)}ms`);
    
    return redirect(redirectTo || "/dashboard", {
      headers: {
        "Set-Cookie": await commitSession(session)
      }
    });
  } catch (error) {
    // Log the error with context
    operationLogger.error({
      message: "Operation failed",
      error,
      operation: "auth.login.submit", 
      requestId
    });
    
    // Track unexpected errors
    const metrics = logger.child({
      'telemetry.type': 'metric',
      trace_id: getTraceContext().traceId,
      span_id: getTraceContext().spanId,
      trace_flags: getTraceContext().traceFlags
    });
    
    metrics.info({
      'metric.name': "auth.login.error",
      'metric.type': 'counter',
      'metric.value': 1,
      error_type: error instanceof Error ? error.name : "unknown"
    });
    
    // Log event
    const events = logger.child({
      'event.domain': 'auth',
      requestId,
      trace_id: getTraceContext().traceId,
      span_id: getTraceContext().spanId,
      trace_flags: getTraceContext().traceFlags
    });
    
    events.info({
      'event.name': "login.error",
      requestId,
      error_type: error instanceof Error ? error.name : "unknown",
      error_message: error instanceof Error ? error.message : String(error)
    });
    
    // Stop the timer
    const duration = performance.now() - startTime;
    metrics.info({
      'metric.name': "auth.login.duration",
      'metric.type': 'histogram',
      'metric.value': duration,
      'metric.unit': 'ms',
      outcome: "error"
    });
    
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
  return { 
    get: (key: string) => null,
    set: (key: string, value: any) => {} // Add this method
  };
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