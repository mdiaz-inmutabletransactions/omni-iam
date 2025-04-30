# KratosFetch API Wrapper

## Introduction

KratosFetch is a modern, lightweight API wrapper for Ory Kratos built on the Fetch API. It provides a clean, middleware-based architecture for interacting with Kratos' identity management services while offering flexible logging and monitoring capabilities.

## Key Features

- **Middleware Architecture**: Pre, main, and post middleware hooks for complete request lifecycle control
- **Optional Logging**: Configurable logging at each middleware stage
- **TypeScript Support**: Full type definitions for all Kratos API responses
- **Error Handling**: Consistent error handling patterns across all API calls
- **Circuit Breaker**: Built-in resilience patterns for handling service outages

## Architecture Overview

```mermaid
graph TD
    A[Client Request] --> B[Pre-Middleware]
    B --> C[Main Kratos API Call]
    C --> D[Post-Middleware]
    D --> E[Client Response]
    
    B -->|Optional Logging| F[Logger]
    C -->|Optional Logging| F
    D -->|Optional Logging| F
```

## Middleware Structure

### Pre-Middleware
- Request validation
- Authentication headers
- Request logging (optional)
- Circuit breaker check

### Main Middleware
- Actual Kratos API call
- Response type validation
- Error handling

### Post-Middleware 
- Response transformation
- Error formatting
- Response logging (optional)
- Metrics collection

## Installation

```bash
npm install @ory/kratos-client kratos-fetch
```

## Basic Usage

```typescript
import { KratosFetch } from './kratos';

const kratos = new KratosFetch({
  baseUrl: 'https://kratos.example.com',
  enableLogging: true,
  middlewares: {
    pre: [/* custom pre-middleware */],
    post: [/* custom post-middleware */]
  }
});

// Example login flow
const flow = await initLoginFlow(true); // Enable debug logging

// Example login submission
const result = await submitLogin(flow.id, {
  identifier: "user@example.com",
  password: "password123"
});
```

## API Reference

### `initLoginFlow()`
Initializes a new login flow

**Options:**
- `returnTo`: string - URL to return to after login
- `refresh`: boolean - Refresh the flow

### `submitLogin(flowId: string, payload: LoginPayload)`
Submits login credentials

**Middleware Hooks:**
- `pre`: Validates payload structure
- `post`: Transforms error responses

## Configuration

```typescript
interface KratosFetchConfig {
  baseUrl: string;
  enableLogging?: boolean;
  circuitBreaker?: {
    threshold: number;
    timeout: number;
  };
  middlewares?: {
    pre: Middleware[];
    post: Middleware[];
  };
}
```

## Error Handling

All errors follow the format:
```typescript
{
  status: number;
  message: string;
  details?: any;
  isNetworkError: boolean;
}
```

## Logging

To enable logging:
```typescript
new KratosFetch({
  enableLogging: true,
  logger: console // Can be any logger interface
});
```

## Contributing

1. Fork the repository
2. Create feature branch
3. Submit pull request

## License

MIT
