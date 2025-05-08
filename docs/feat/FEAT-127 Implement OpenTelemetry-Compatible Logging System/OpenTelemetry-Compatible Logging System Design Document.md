# OpenTelemetry-Compatible Logging System Design Document

## Overview

This document outlines the design and implementation of a comprehensive OpenTelemetry-compatible logging system for JavaScript and TypeScript applications, with specific focus on Remix applications. The system provides standardized observability across all application components while following the OpenTelemetry data model for logs.

## Core Components

### LoggerInstance Interface

The central interface that provides structured logging capabilities aligned with OpenTelemetry standards:

```typescript
export interface LoggerInstance {
  trace: (data: string | OtelLogRecord | any, attrs?: Record<string, any>) => void;
  debug: (data: string | OtelLogRecord | any, attrs?: Record<string, any>) => void;
  info: (data: string | OtelLogRecord | any, attrs?: Record<string, any>) => void;
  warn: (data: string | OtelLogRecord | any, attrs?: Record<string, any>) => void;
  error: (data: string | OtelLogRecord | any, attrs?: Record<string, any>) => void;
  fatal: (data: string | OtelLogRecord | any, attrs?: Record<string, any>) => void;
  child: (context: LogContext) => LoggerInstance;
  event: (name: string, data?: Record<string, any>) => void;
  metric: (name: string, value: number, attributes?: Record<string, any>) => void;
  flush?: () => void;
}
```

### OpenTelemetry Log Record

Standardized structure for log records following the OpenTelemetry specification:

```typescript
export interface OtelLogRecord {
  // Timestamps
  time?: string;                      // ISO8601 timestamp
  observed_time?: string;             // Observation timestamp
  
  // Trace context
  trace_id?: string;                  // W3C trace ID (hex)
  span_id?: string;                   // W3C span ID (hex)
  trace_flags?: number;               // Trace flags (1=sampled)
  
  // Severity
  severity_number?: number;           // Numeric severity level
  severity_text?: string;             // Text severity level
  
  // Content
  body?: string | Record<string, any>; // Log message or structured data
  attributes?: Record<string, any>;    // Additional attributes
  
  // Resource information
  resource?: Record<string, any>;      // Service & environment details
  
  // Legacy fields for backward compatibility
  [key: string]: any;
}
```

### Logger Creation Functions

Specialized factory functions to create loggers for different application components:

1. **createContextLogger**: Base function to create a logger with context
2. **createComponentLogger**: Creates a logger for a specific application component
3. **createOperationLogger**: Creates a logger for specific user operations or workflows
4. **createRequestLogger**: Creates a logger with HTTP request context (ideal for Remix loaders/actions)

## Key Features

### 1. Universal Compatibility

The system is designed to work seamlessly in both server and browser environments:

- **Server-side (Node.js)**: Full featured with file logging and OpenTelemetry integration
- **Browser-side**: Console logging with OpenTelemetry context preservation
- **Remix-specific**: Special handling for server/client code splitting

```typescript
// Detect environment
const isNodeEnvironment = typeof process !== 'undefined' && 
                          process.versions != null && 
                          process.versions.node != null;

// Create appropriate logger based on environment
function createLogger() {
  if (isNodeEnvironment) {
    return createServerLogger();
  } else {
    return createBrowserLogger();
  }
}
```

### 2. W3C Trace Context Integration

Automatic integration with the W3C Trace Context specification for distributed tracing:

```typescript
function getTraceContext(): { traceId?: string, spanId?: string, traceFlags?: number } {
  // Extract trace context from environment, headers, or current scope
  // First check environment variables (server-side)
  const traceparent = typeof process !== 'undefined' ? process.env.TRACEPARENT : undefined;
  
  // Then check if it's in the current storage (browser-side)
  const browserTraceparent = typeof localStorage !== 'undefined' ? 
    localStorage.getItem('traceparent') : undefined;
  
  const effectiveTraceparent = traceparent || browserTraceparent;
  
  if (effectiveTraceparent) {
    // Parse W3C trace context format: 00-traceId-spanId-flags
    const parts = effectiveTraceparent.split('-');
    if (parts.length === 4) {
      return {
        traceId: parts[1],
        spanId: parts[2],
        traceFlags: parseInt(parts[3], 16)
      };
    }
  }
  
  // Generate new trace context if none exists
  return {
    traceId: randomHex(32),
    spanId: randomHex(16),
    traceFlags: 1 // Sampled
  };
}
```

### 3. Resource Detection

Automatic detection of service and environment information:

```typescript
function getResourceInfo(): Record<string, any> {
  const resourceInfo: Record<string, any> = {
    'service.name': getEnv('OTEL_SERVICE_NAME', 'unknown_service'),
    'service.version': getEnv('OTEL_SERVICE_VERSION', '0.0.0'),
    'environment': getEnv('VITE_PUBLIC_ENV', 'development')
  };
  
  // Add Node.js-specific information
  if (isNodeEnvironment) {
    const os = require('os');
    resourceInfo['host.name'] = os.hostname();
    resourceInfo['host.arch'] = os.arch();
    resourceInfo['host.type'] = os.type();
    resourceInfo['process.pid'] = process.pid;
    resourceInfo['process.runtime.name'] = 'node';
    resourceInfo['process.runtime.version'] = process.version;
  } 
  // Add browser-specific information
  else if (typeof navigator !== 'undefined') {
    resourceInfo['browser.user_agent'] = navigator.userAgent;
    resourceInfo['browser.language'] = navigator.language;
    resourceInfo['browser.platform'] = navigator.platform;
    resourceInfo['client.type'] = 'browser';
  }
  
  return resourceInfo;
}
```

### 4. Remix-Specific Integration

Special handling for Remix's unique server/client architecture:

```typescript
/**
 * Creates a logger for a Remix loader or action
 * @param request The Remix request object
 * @param routeId The ID of the current route
 * @param handler The type of handler ('loader' or 'action')
 */
export function createRemixRouteLogger(
  request: Request, 
  routeId: string,
  handler: 'loader' | 'action'
): LoggerInstance {
  const url = new URL(request.url);
  const requestId = request.headers.get('X-Request-ID') || crypto.randomUUID();
  
  return createRequestLogger(request, {
    'remix.route': routeId,
    'remix.handler': handler,
    'remix.params': url.searchParams.toString()
  });
}

/**
 * Creates a logger for a Remix client-side component
 * @param componentName The name of the component
 * @param routeId The ID of the current route (optional)
 */
export function createRemixComponentLogger(
  componentName: string,
  routeId?: string
): LoggerInstance {
  const context: Record<string, any> = {
    component: componentName,
    'client.type': 'browser'
  };
  
  if (routeId) {
    context['remix.route'] = routeId;
  }
  
  return createComponentLogger(componentName, context);
}
```

### 5. Structured Event Logging

Specialized methods for event logging with standardized format:

```typescript
event: (name: string, data: Record<string, any> = {}) => { 
  logWithContext('info', { 
    ...data,
    'event.name': name,
    'event.domain': data.domain || 'app'
  });
  return true;
}
```

### 6. Performance Metrics

Built-in support for metrics collection:

```typescript
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
```

### 7. Sensitive Data Redaction

Automatic redaction of sensitive information:

```typescript
export function redactSensitiveInfo(
  obj: unknown, 
  sensitiveFields: string[] = ['password', 'token', 'secret', 'authorization', 'credential']
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
```

## Transport Configuration

The system supports multiple log targets configurable through environment variables:

1. **Console**: Pretty-printed logs for development
2. **File**: JSON logs for persistence and analysis
3. **OpenTelemetry**: Direct integration with OpenTelemetry collectors

```typescript
export function createPinoConfig(
  logTargets: string[],
  logLevel: string = 'info',
  logFilePath: string = './logs'
): LoggerOptions<never, boolean> {
  const targets: TransportTargetOptions[] = [];
  
  // Configure console transport
  if (logTargets.includes('console')) {
    targets.push({
      target: 'pino-pretty',
      level: logLevel,
      options: {
        colorize: true,
        ignore: 'pid,hostname',
        messageFormat: '{msg} {attributes}',
        translateTime: true,
      }
    });
  }
  
  // Configure file transport (server-side only)
  if (isNodeEnvironment && logTargets.includes('file')) {
    targets.push({
      target: 'pino/file',
      level: logLevel,
      options: {
        destination: safeLogFilePath(logFilePath, 'app.log'),
        mkdir: true,
        sync: true,
      },
    });
  }
  
  // Configure OpenTelemetry transport (server-side only)
  if (isNodeEnvironment && logTargets.includes('opentelemetry')) {
    targets.push({
      target: 'pino-opentelemetry-transport',
      level: logLevel,
      options: {
        serviceNameTag: getEnv('OTEL_SERVICE_NAME', 'unknown_service'),
        endpoint: getEnv('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://localhost:4317')
      }
    });
  }
  
  return {
    // ...configuration
    transport: {
      targets,
    }
  };
}
```

## Usage Examples

### Remix Loader/Action Example

```typescript
// app/routes/products.$id.tsx
import { json, type LoaderFunction, type ActionFunction } from "@remix-run/node";
import { createRemixRouteLogger } from "~/core/Observability";

export const loader: LoaderFunction = async ({ request, params }) => {
  const logger = createRemixRouteLogger(request, "products.$id", "loader");
  const productId = params.id;
  
  logger.info(`Loading product details`, { productId });
  
  try {
    const product = await getProduct(productId);
    
    if (!product) {
      logger.warn(`Product not found`, { productId });
      return json({ error: "Product not found" }, { status: 404 });
    }
    
    logger.info(`Product loaded successfully`, { 
      productId, 
      productName: product.name
    });
    
    return json({ product });
  } catch (error) {
    logger.error({
      message: `Failed to load product`,
      error,
      productId
    });
    
    return json(
      { error: "An error occurred while loading the product" }, 
      { status: 500 }
    );
  }
};

export const action: ActionFunction = async ({ request, params }) => {
  const logger = createRemixRouteLogger(request, "products.$id", "action");
  const productId = params.id;
  
  logger.info(`Processing product action`, { productId });
  
  // Start timing the operation
  const timer = performance.now();
  
  try {
    const formData = await request.formData();
    const intent = formData.get("intent");
    
    logger.info(`Processing ${intent} action`, { productId, intent });
    
    // Process based on intent
    switch (intent) {
      case "update":
        const updatedProduct = await updateProduct(productId, formData);
        logger.info(`Product updated successfully`, { productId });
        break;
      case "delete":
        await deleteProduct(productId);
        logger.info(`Product deleted successfully`, { productId });
        break;
      default:
        logger.warn(`Unknown intent`, { intent, productId });
        return json({ error: "Unknown action" }, { status: 400 });
    }
    
    // Log performance metric
    const duration = performance.now() - timer;
    logger.info({
      'metric.name': 'product.action.duration',
      'metric.value': duration,
      'metric.unit': 'ms',
      productId,
      intent
    });
    
    return json({ success: true });
  } catch (error) {
    logger.error({
      message: `Action failed`,
      error,
      productId
    });
    
    return json(
      { error: "An error occurred while processing your request" }, 
      { status: 500 }
    );
  }
};
```

### Component Logger Example

```typescript
// app/components/ShoppingCart.tsx
import { useEffect, useState } from "react";
import { createRemixComponentLogger } from "~/core/Observability";

const logger = createRemixComponentLogger("ShoppingCart");

export default function ShoppingCart({ items, onCheckout }) {
  const [total, setTotal] = useState(0);
  
  useEffect(() => {
    logger.debug("Shopping cart mounted", { itemCount: items.length });
    
    // Calculate total price
    const cartTotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    setTotal(cartTotal);
    
    logger.debug("Cart total calculated", { total: cartTotal });
    
    return () => {
      logger.debug("Shopping cart unmounted");
    };
  }, [items]);
  
  const handleCheckout = () => {
    logger.info("Checkout initiated", { 
      itemCount: items.length, 
      total 
    });
    
    // Log as a business event
    logger.event("cart.checkout", {
      itemCount: items.length,
      total,
      items: items.map(item => ({
        id: item.id,
        quantity: item.quantity
      }))
    });
    
    onCheckout();
  };
  
  return (
    <div className="shopping-cart">
      {/* Cart UI */}
      <button onClick={handleCheckout}>Checkout (${total.toFixed(2)})</button>
    </div>
  );
}
```

### API Service Example

```typescript
// app/services/userService.ts
import { createComponentLogger, createOperationLogger } from "~/core/Observability";

// Component-level logger for the service
const logger = createComponentLogger("UserService");

export async function getUser(userId: string) {
  // Create operation-specific logger
  const opLogger = createOperationLogger("user.get", crypto.randomUUID(), {
    userId
  });
  
  opLogger.info("Fetching user data");
  
  try {
    const timer = performance.now();
    const user = await fetchUserFromDatabase(userId);
    const duration = performance.now() - timer;
    
    // Log performance metric
    opLogger.info({
      'metric.name': 'database.query.duration',
      'metric.value': duration,
      'metric.unit': 'ms',
      operation: 'fetchUser',
      success: true
    });
    
    if (!user) {
      opLogger.warn("User not found", { userId });
      return null;
    }
    
    opLogger.info("User fetched successfully", {
      userId,
      userEmail: user.email
    });
    
    return user;
  } catch (error) {
    opLogger.error({
      message: "Failed to fetch user",
      error,
      userId
    });
    
    throw error;
  }
}

export async function updateUserProfile(userId: string, profileData: any) {
  // Create operation-specific logger
  const opLogger = createOperationLogger("user.update", crypto.randomUUID(), {
    userId
  });
  
  opLogger.info("Updating user profile", {
    userId,
    fields: Object.keys(profileData)
  });
  
  try {
    // Redact any sensitive information before logging
    const safeProfileData = redactSensitiveInfo(profileData);
    
    opLogger.debug("Processing profile update", {
      userId,
      profileData: safeProfileData
    });
    
    const updatedUser = await updateUserInDatabase(userId, profileData);
    
    opLogger.info("User profile updated successfully", {
      userId,
      updatedFields: Object.keys(profileData)
    });
    
    // Log as a business event
    opLogger.event("user.profile_updated", {
      userId,
      fields: Object.keys(profileData)
    });
    
    return updatedUser;
  } catch (error) {
    opLogger.error({
      message: "Failed to update user profile",
      error,
      userId
    });
    
    throw error;
  }
}
```

## Configuration Options

The logging system can be configured through environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `LOG_LEVEL` | Minimum log level to record | `info` |
| `LOG_TARGETS` | Comma-separated list of targets | `console` |
| `LOG_FORMAT` | Log format (`json` or `pretty`) | `json` |
| `LOG_FILE_PATH` | Path for log files | `./logs` |
| `LOG_FILE_ROTATION` | Enable log rotation | `true` |
| `LOG_MAX_SIZE` | Maximum log file size | `10MB` |
| `LOG_INCLUDE_TIMESTAMP` | Include timestamps | `true` |
| `LOG_INCLUDE_HOSTNAME` | Include hostname | `true` |
| `CORRELATION_ID_HEADER` | Header for correlation IDs | `X-Correlation-ID` |
| `REDACT_FIELDS` | Fields to redact | `password,secret,token,authorization,cookie` |
| `OTEL_ENABLED` | Enable OpenTelemetry | `false` |
| `OTEL_SERVICE_NAME` | Service name | `unknown_service` |
| `OTEL_SERVICE_VERSION` | Service version | `0.0.0` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP endpoint | `http://localhost:4317` |

## Best Practices

### 1. Use Specialized Loggers

Match logger types to application components:

- **Component Logger**: For services, utilities, and reusable components
- **Operation Logger**: For user operations and multi-step processes
- **Request Logger**: For HTTP endpoints, Remix loaders and actions
- **Event Logger**: For business events and domain-specific occurrences

### 2. Structure Your Logs

Use structured logging instead of string messages:

```typescript
// ❌ Avoid this:
logger.info(`User ${userId} updated profile with email ${email}`);

// ✅ Do this instead:
logger.info({
  message: "User updated profile",
  userId,
  email
});
```

### 3. Use Semantic Conventions

Follow OpenTelemetry semantic conventions for attribute naming:

- `user.id` instead of `userId`
- `http.method` instead of `method`
- `service.name` instead of `serviceName`
- `event.name` for event names

### 4. Include Context

Add relevant context to every log:

```typescript
logger.info({
  message: "Order processed",
  'order.id': orderId,
  'customer.id': customerId,
  'order.total': total,
  'order.items.count': items.length,
  'payment.method': paymentMethod
});
```

### 5. Handle Errors Properly

Log errors with full context:

```typescript
try {
  // Operation that might fail
} catch (error) {
  logger.error({
    message: "Operation failed",
    error,  // Will extract name, message, and stack
    operationId,
    // Additional context
    attempt: retryCount,
    timestamp: new Date().toISOString()
  });
}
```

### 6. Use Correlation IDs

Ensure logs can be traced across services:

```typescript
// In an HTTP handler
const requestId = request.headers.get('X-Request-ID') || crypto.randomUUID();

// Include in all logs
logger.info("Processing request", { requestId });

// Pass to downstream services
await fetch("https://api.example.com/data", {
  headers: {
    "X-Request-ID": requestId
  }
});
```

### 7. Log Lifecycle Events

Log component and operation lifecycle events:

```typescript
// Component initialization
logger.info("Service initialized", { version: "1.0.0" });

// Operation start
operationLogger.info("Operation started", { parameters });

// Operation completion
operationLogger.info("Operation completed", { 
  duration: 123.45,
  outcome: "success"
});
```

### 8. Use the Right Log Levels

Choose appropriate log levels:

- **trace**: Ultra-detailed debugging
- **debug**: Development information
- **info**: Normal operations, business events
- **warn**: Potential issues that don't interrupt operation
- **error**: Run-time errors that require attention
- **fatal**: Critical failures that stop the application

### 9. Redact Sensitive Information

Never log sensitive data:

```typescript
// ❌ Avoid this:
logger.info("User credentials", { 
  username: "john", 
  password: "secret123" // Exposing passwords!
});

// ✅ Do this instead:
const safeData = redactSensitiveInfo({ 
  username: "john", 
  password: "secret123" 
});
logger.info("User credentials", safeData); // password will be "[REDACTED]"
```

### 10. Monitor Performance

Use metrics for performance monitoring:

```typescript
// Start timer
const startTime = performance.now();

// Perform operation
await expensiveOperation();

// Log performance
const duration = performance.now() - startTime;
logger.info({
  'metric.name': 'operation.duration',
  'metric.value': duration,
  'metric.unit': 'ms',
  operation: 'expensiveOperation'
});
```

## Conclusion

This comprehensive logging system provides standardized observability for JavaScript and Remix applications following OpenTelemetry standards. By implementing this system, applications gain detailed visibility into operations, errors, and performance while ensuring compatibility with modern observability platforms.