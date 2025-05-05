# Observability System

## Overview

The Observability system provides a comprehensive solution for logging, tracing, and monitoring your application. It is built as a centralized, configurable system that integrates with OpenTelemetry to provide distributed tracing, structured logging, and metrics collection capabilities.

## Key Features

- 🔍 **Structured Logging**: All logs are JSON-formatted for easy parsing and searching
- 🧩 **Context-Based Logging**: Create loggers with specific contexts for better organization
- 🔄 **Request Tracing**: Trace requests through your system with correlation IDs
- 🛡️ **Automatic Redaction**: Sensitive information is automatically redacted
- 📊 **OpenTelemetry Integration**: Send traces and metrics to your observability backend
- 🧪 **Environment-Aware**: Different configurations for development and production
- 🔧 **Compatibility Mode**: Smart handling of Pino transport configurations
- 📈 **Custom Resource Attribution**: Add service metadata to all telemetry

## Architecture

The Observability system follows a similar pattern to the ViteEnv manager, providing a singleton-based configuration system with validators, transformers, and default values:

```
app/core/Observability/
├── index.ts            # Main entry point exporting all functionality
├── logs.ts             # Core logging functionality
├── logUtils.ts         # Utility functions for logging
├── opentelemetry.ts    # OpenTelemetry integration
```

## Getting Started

### Basic Logging

```typescript
import { logger } from '~/core/Observability';

// Simple logging
logger.info('Application started');

// With context
logger.info({ userId: '123' }, 'User logged in');

// Error logging with stack traces
try {
  // Some operation
} catch (error) {
  logger.error({ error }, 'Operation failed');
}
```

### Context-Based Logging

```typescript
import { createComponentLogger } from '~/core/Observability';

// Create a logger for a specific component
const authLogger = createComponentLogger('auth-service');

// All logs will include component: 'auth-service'
authLogger.info('Authentication service started');
authLogger.warn({ userId: '123' }, 'Login attempt failed');
```

### Request Logging

```typescript
import { createRequestLogger } from '~/core/Observability';

// In your request handler
export async function loader({ request }: LoaderArgs) {
  const requestLogger = createRequestLogger(request);
  
  requestLogger.info('Processing request');
  
  try {
    // Process request
    const result = await processRequest(request);
    requestLogger.info({ result }, 'Request processed successfully');
    return json(result);
  } catch (error) {
    requestLogger.error({ error }, 'Request processing failed');
    throw error;
  }
}
```

### Operation Logging

```typescript
import { createOperationLogger } from '~/core/Observability';

async function processPayment(userId: string, amount: number) {
  // Generate a unique ID for this operation
  const operationId = crypto.randomUUID();
  const logger = createOperationLogger('payment-processing', operationId, { userId });
  
  logger.info({ amount }, 'Starting payment processing');
  
  try {
    // Process payment
    logger.info('Payment processed successfully');
    return { success: true };
  } catch (error) {
    logger.error({ error }, 'Payment processing failed');
    throw error;
  }
}
```

## Configuration

The Observability system can be configured through environment variables and the ViteEnv system:

| Variable | Description | Default |
|----------|-------------|---------|
| `LOG_LEVEL` | Minimum log level (`trace`, `debug`, `info`, `warn`, `error`, `fatal`) | `debug` in development, `info` in production |
| `LOG_TARGETS` | Comma-separated list of output targets (`console`, `file`, `opentelemetry`) | `console` in development, `file,opentelemetry` in production |
| `LOG_FORMAT` | Log format (`json` or `pretty`) | `pretty` in development, `json` in production |
| `LOG_FILE_PATH` | Path to log files | `./logs` |
| `LOG_FILE_ROTATION` | Enable log file rotation | `true` |
| `LOG_MAX_SIZE` | Maximum log file size in bytes | `10485760` (10MB) |
| `LOG_INCLUDE_TIMESTAMP` | Include timestamp in logs | `true` |
| `LOG_INCLUDE_HOSTNAME` | Include hostname in logs | `true` |
| `CORRELATION_ID_HEADER` | HTTP header for correlation IDs | `X-Correlation-ID` |
| `REDACT_FIELDS` | Comma-separated list of fields to redact | `password,secret,token,authorization,cookie` |
| `OTEL_ENABLED` | Enable OpenTelemetry | `true` in production |
| `OTEL_SERVICE_NAME` | Service name for OpenTelemetry | `omni-iam` |
| `OTEL_SERVICE_VERSION` | Service version for OpenTelemetry | `1.0.0` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP endpoint URL | `http://localhost:4317` |

## ViteEnv Integration

The Observability system is fully integrated with the ViteEnv system, allowing for centralized configuration management and validation. To use the system, make sure to set up the environment variables in your ViteEnv configuration:

```typescript
// app/core/ViteEnv/index.ts
export type EnvSchema = {
  // Existing variables...
  
  // Logging configuration
  LOG_LEVEL: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  LOG_TARGETS: string;
  LOG_FORMAT: 'json' | 'pretty';
  // ... other variables
  
  // OpenTelemetry configuration
  OTEL_ENABLED: boolean;
  OTEL_SERVICE_NAME: string;
  // ... other variables
};
```

## OpenTelemetry Integration

The Observability system automatically integrates with OpenTelemetry when enabled:

```typescript
import { initializeOpenTelemetry } from '~/core/Observability';

// Initialize OpenTelemetry with default configuration
initializeOpenTelemetry();
```

### Custom Resource Attributes

The OpenTelemetry implementation creates a custom resource with your service information:

```typescript
// Custom resource creation
const resource = resourceFromAttributes({
  [SemanticResourceAttributes.SERVICE_NAME]: ViteEnv.OTEL_SERVICE_NAME,
  [SemanticResourceAttributes.SERVICE_VERSION]: ViteEnv.OTEL_SERVICE_VERSION,
  [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: ViteEnv.VITE_PUBLIC_ENV,
});
```

This attaches your service name, version, and environment to all telemetry data, making it easier to filter and analyze in your observability backend.

## Implementation Details

### Logger Implementation

The Observability system uses Pino as its logging library, with a custom configuration to support different output formats and redaction of sensitive information:

```typescript
const logger = pino({
  level: 'info',
  redact: {
    paths: ['password', 'secret', 'token'],
    censor: '[REDACTED]'
  },
  transport: {
    targets: [
      { target: 'pino/file', options: { destination: './logs/app.log' } }
    ]
  }
});
```

### Transport Mode Detection

The system automatically detects whether you're using Pino transports and applies the correct configuration:

```typescript
// When using transports (file or OpenTelemetry outputs)
return pino({
  level: this.config.LOG_LEVEL,
  redact: redactOptions,
  transport: {
    targets: transports
  }
});

// When not using transports (direct console output)
return pino({
  level: this.config.LOG_LEVEL,
  redact: redactOptions,
  formatters: {
    level: (label) => ({ level: label }),
    bindings: (bindings) => ({ ...bindings })
  }
});
```

### Context-Based Loggers

The system provides helper functions to create context-specific loggers:

```typescript
// Create a component logger
const componentLogger = createComponentLogger('database');

// Create a request logger
const requestLogger = createRequestLogger(request);

// Create an operation logger
const operationLogger = createOperationLogger('data-migration', uuid);
```

## Debug Tools

### Debug Observability Route

The system includes a dedicated debug route at `/debug-observability` that provides a comprehensive view of your Observability configuration and allows you to generate test logs and traces:

**URL**: `/debug-observability`

**Features**:
- Display of all Observability configuration settings
- Current environment information
- Real-time log generation and viewing
- Trace simulation
- Configuration validation

This page is especially useful during development and testing to ensure your Observability system is properly configured.

**Test Actions**:
- Generate Test Logs: Creates logs at different levels (trace, debug, info, warn, error)
- Start Test Trace: Simulates a trace with a randomly generated trace ID

**Compatibility**:
The debug page is designed to work in both server and browser environments, with special handling for browser limitations regarding Node.js-specific OpenTelemetry features.

## Best Practices

1. **Use structured logging**: Always include relevant context as an object
   ```typescript
   // Good
   logger.info({ userId, action }, 'User performed action');
   
   // Avoid
   logger.info(`User ${userId} performed action ${action}`);
   ```

2. **Create component-specific loggers**: Makes filtering and searching easier
   ```typescript
   const dbLogger = createComponentLogger('database');
   const authLogger = createComponentLogger('auth');
   ```

3. **Include request IDs**: Helps with tracing requests through the system
   ```typescript
   const requestId = req.headers['x-request-id'] || crypto.randomUUID();
   const requestLogger = createContextLogger({ requestId });
   ```

4. **Log at appropriate levels**:
   - `trace`: Extremely detailed information
   - `debug`: Useful development information
   - `info`: Normal application behavior
   - `warn`: Something unexpected but not error
   - `error`: Error conditions
   - `fatal`: Severe errors that cause application termination

5. **Redact sensitive information**: Never log passwords, tokens, or personal information
   ```typescript
   // Automatic redaction for known fields
   logger.info({ password: '123456' }); // Will log { password: '[REDACTED]' }
   ```

6. **Leverage ViteEnv integration**: Use environment variables from ViteEnv
   ```typescript
   // Timezone from ViteEnv used for timestamps
   timestamp: () => `,"time":"${DateTime.now().setZone(ViteEnv.TIMEZONE).toISOS()}"`,
   ```

## Performance Considerations

- The logging system is designed to be high-performance with minimal overhead
- JSON logging is faster than pretty printing in production
- Consider setting an appropriate log level in production (usually `info`)
- File rotation is enabled by default to prevent disk space issues
- Transport-based logging provides better throughput for high-volume applications

## Browser Compatibility

The Observability system is designed to work in both Node.js and browser environments, with automatic detection and appropriate fallbacks. OpenTelemetry-specific features that rely on Node.js modules are only used in server contexts, while browser-compatible alternatives are used in client contexts.

## Examples

### Full Route with Observability

```typescript
// app/routes/example.tsx
import { json, LoaderFunction } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { createRequestLogger } from "~/core/Observability";

export const loader: LoaderFunction = async ({ request }) => {
  const logger = createRequestLogger(request, { route: "example" });
  
  logger.info("Example route accessed");
  
  try {
    const data = await fetchSomeData();
    logger.info({ dataSize: data.length }, "Data fetched successfully");
    return json({ data });
  } catch (error) {
    logger.error({ error }, "Failed to fetch data");
    throw error;
  }
};

export default function Example() {
  const { data } = useLoaderData<typeof loader>();
  
  return (
    <div>
      <h1>Example Route</h1>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}
```

### Custom Operation with Tracing

```typescript
// app/lib/operations.ts
import { createOperationLogger } from "~/core/Observability";

export async function importData(source: string, options: ImportOptions) {
  const operationId = crypto.randomUUID();
  const logger = createOperationLogger("data-import", operationId, { source });
  
  logger.info({ options }, "Starting data import");
  
  try {
    // Operation implementation
    const result = await performImport(source, options);
    
    logger.info({ count: result.count }, "Data import completed");
    return result;
  } catch (error) {
    logger.error({ error }, "Data import failed");
    throw error;
  }
}
```

### Middleware Integration

```typescript
// app/middleware/logging.ts
import { createRequestLogger } from "~/core/Observability";

export function loggingMiddleware(request: Request, next: () => Promise<Response>) {
  const logger = createRequestLogger(request);
  const url = new URL(request.url);
  
  logger.info({
    method: request.method,
    path: url.pathname,
    query: url.search
  }, "Request received");
  
  const start = performance.now();
  
  return next().then(response => {
    const duration = performance.now() - start;
    
    logger.info({
      status: response.status,
      duration
    }, "Request completed");
    
    return response;
  }).catch(error => {
    logger.error({ error }, "Request failed");
    throw error;
  });
}
```