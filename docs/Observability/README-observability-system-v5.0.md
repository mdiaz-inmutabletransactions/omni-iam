# Observability System

## Overview

This observability system provides a comprehensive solution for logging, tracing, and monitoring your application. It is built around the following core components:

- **Pino Logger**: Fast and low-overhead logging with structured JSON output
- **OpenTelemetry**: Distributed tracing and metrics collection
- **Configurable Outputs**: Console, file, and OpenTelemetry transports
- **Custom Resource Attribution**: Add service metadata to all telemetry

## Features

- 🔍 **Structured Logging**: All logs are JSON-formatted for easy parsing and searching
- 🧩 **Context-Based Logging**: Create loggers with specific contexts for better organization
- 🔄 **Request Tracing**: Trace requests through your system with correlation IDs
- 🛡️ **Automatic Redaction**: Sensitive information is automatically redacted
- 📊 **OpenTelemetry Integration**: Send traces and metrics to your observability backend
- 🧪 **Environment-Aware**: Different configurations for development and production
- 🔧 **Compatibility Mode**: Smart handling of Pino transport configurations

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

The logging system can be configured through environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `LOG_LEVEL` | Minimum log level (`trace`, `debug`, `info`, `warn`, `error`, `fatal`) | `debug` in development, `info` in production |
| `LOG_TARGETS` | Comma-separated list of output targets (`console`, `file`, `opentelemetry`) | `console` in development, `file,opentelemetry` in production |
| `LOG_FORMAT` | Log format (`json` or `pretty`) | `pretty` in development, `json` in production |
| `LOG_FILE_PATH` | Path to log files | `./logs` |
| `REDACT_FIELDS` | Comma-separated list of fields to redact | `password,secret,token,authorization,cookie` |
| `LOG_INCLUDE_TIMESTAMP` | Include timestamp in logs | `true` |
| `LOG_INCLUDE_HOSTNAME` | Include hostname in logs | `true` |
| `OTEL_ENABLED` | Enable OpenTelemetry | `true` in production |
| `OTEL_SERVICE_NAME` | Service name for OpenTelemetry | `omni-iam` |
| `OTEL_SERVICE_VERSION` | Service version for OpenTelemetry | `1.0.0` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP endpoint URL | `http://localhost:4317` |

## Advanced Usage

### Logging Deeply Nested Objects

```typescript
import { logger, formatObject } from '~/core/Observability';

const complexObject = {
  user: {
    id: '123',
    profile: {
      name: 'John Doe',
      preferences: {
        theme: 'dark',
        notifications: ['email', 'push']
      }
    }
  },
  metadata: {
    requestId: '456',
    timestamp: new Date()
  }
};

// Option 1: Let Pino handle it
logger.info({ complexObject }, 'Complex object');

// Option 2: Format it yourself with more control
console.log('Debug output:');
console.log(formatObject(complexObject, { depth: 5, colors: true }));
```

### Runtime Configuration

```typescript
import { logManager } from '~/core/Observability';

// Get current configuration
const config = logManager.getConfig();
console.log('Current log level:', config.LOG_LEVEL);

// Change configuration at runtime
logManager.setConfig({ LOG_LEVEL: 'debug' });
```

### Integration with OpenTelemetry

The system automatically integrates with OpenTelemetry when enabled. To manually initialize:

```typescript
import { initializeOpenTelemetry } from '~/core/Observability';

// Initialize OpenTelemetry with default configuration
initializeOpenTelemetry();
```

## Implementation Notes

### Pino Transport Compatibility

The system detects whether you're using Pino transports and automatically applies the correct configuration:

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
    bindings: (bindings) => this.config.LOG_INCLUDE_HOSTNAME ? bindings : { pid: bindings.pid }
  }
});
```

This approach works around Pino's limitation where custom formatters can't be used with transport targets.

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

6. **Leverage ViteEnv integration**: Use environment variables from ViteEnv to control log behavior
   ```typescript
   // Timezone from ViteEnv used for timestamps
   timestamp: () => `,"time":"${DateTime.now().setZone(ViteEnv.TIMEZONE).toISO()}"`
   ```

## Performance Considerations

- The logging system is designed to be high-performance with minimal overhead
- JSON logging is faster than pretty printing in production
- Consider setting an appropriate log level in production (usually `info`)
- File rotation is enabled by default to prevent disk space issues
- Transport-based logging provides better throughput for high-volume applications