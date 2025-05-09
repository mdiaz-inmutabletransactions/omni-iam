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