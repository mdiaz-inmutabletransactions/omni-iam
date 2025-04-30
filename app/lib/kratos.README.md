# Kratos API Wrapper Documentation

## Middleware System

The `kratosFetch` wrapper supports middleware for pre-request and post-response processing.

### Request Middleware

Request middleware functions receive the URL and request options, and return modified versions:

```typescript
type RequestMiddleware = (url: string, options: RequestInit) => [string, RequestInit]
```

Example - Adding a timestamp header:
```typescript
const timestampMiddleware: RequestMiddleware = (url, options) => {
  return [
    url,
    {
      ...options,
      headers: {
        ...options.headers,
        'X-Timestamp': Date.now().toString()
      }
    }
  ]
}
```

### Response Middleware

Response middleware functions process the response before returning:

```typescript
type ResponseMiddleware<T = any> = (response: Response) => Promise<T>
```

Example - Logging responses:
```typescript
const loggingMiddleware: ResponseMiddleware = async (response) => {
  const data = await response.clone().json()
  console.log('API Response:', data)
  return data
}
```

### Using Middleware

Pass middleware arrays to the `middlewares` parameter:

```typescript
// With both request and response middleware
const result = await kratosFetch('/endpoint', {
  method: 'GET'
}, {
  request: [timestampMiddleware],
  response: [loggingMiddleware]
})
```

## Built-in API Methods

The wrapper provides these convenience methods:

### `initLoginFlow()`
Initializes a new Kratos login flow

### `initRegistrationFlow()` 
Initializes a new Kratos registration flow

### `submitLogin(flowId: string, body: any)`
Submits a login form for the specified flow

## Error Handling

All errors are wrapped in a standardized `KratosError` format:
```typescript
interface KratosError {
  error: {
    code: number
    message: string
    reason: string
  }
}
```

## Debug Logging

All API methods support a `debug` parameter that enables comprehensive logging:

```typescript
// With debug logging enabled
await initLoginFlow(true)
await initRegistrationFlow(true) 
await submitLogin(flowId, body, true)

// With debug logging disabled (default)
await initLoginFlow()
```

Debug logging includes:
- Request method, URL and headers
- Request payload (if any)
- Response status code and headers
- Response payload
- Full error details including:
  - Error response body
  - Response headers
  - Stack traces

Logs are organized in collapsible console groups for better readability.

## Configuration

Set the base URL via environment variable:
```env
KRATOS_PUBLIC_URL=http://your-kratos-instance
