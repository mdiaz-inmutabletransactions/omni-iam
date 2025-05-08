# ViteEnvManager
0.1.0-beta.1 
A robust, type-safe environment variable manager for Vite applications.

## Key Benefits

- **Single Source of Truth** - All environment variables managed in one place
- **Type Safety** - Full TypeScript support with autocomplete
- **Validation** - Runtime checks for critical variables
- **Separation of Concerns** - Clear server vs. client separation
- **Default Values** - Graceful fallbacks
- **Testability** - Easy to mock in tests
- **Security** - Only exposes public variables to client

## Features

### Vite Integration

- Uses `import.meta.env` for client-side variables
- Follows Vite's convention of prefixing client vars with `VITE_`

### Type Safety

- Full TypeScript support with autocomplete
- Schema validation at runtime

### Dynamic Environment Loading

- Automatically reads from all Vite-supported `.env` files
- Respects environment modes (development/production/test)

### Hot Reload Support

- Call `reloadEnv()` to refresh environment variables

### Zero Dependencies

- Uses Vite's built-in environment handling
- No need for additional libraries like dotenv

## Environment File Loading Order

Vite automatically loads files in this order (higher priority overrides lower):

1. `.env.${mode}.local`
2. `.env.${mode}`
3. `.env.local`
4. `.env`

## Installation

```bash
# Copy the env.ts file to your project
cp src/core/env.ts YOUR_PROJECT_PATH/src/core/
```

## Usage

### Basic Usage

```typescript
// Import the env object
import { env } from '@/core/env';

// Access variables with full type safety
const apiUrl = env.VITE_PUBLIC_API_URL;
const isDebug = env.VITE_DEBUG_MODE;

// Server-side only variables (only available in server code)
const dbUrl = env.DATABASE_URL;
const secret = env.SERVER_SECRET;
```

### Setting Environment Variables

```typescript
import { setEnv } from '@/core/env';

// Update a variable at runtime (with validation)
setEnv('VITE_DEBUG_MODE', true);
```

### Reloading Environment

```typescript
import { reloadEnv } from '@/core/env';

// Reload all environment variables
reloadEnv();
```

## Configuration

### Defining Your Schema

Edit the `EnvSchema` type to define your application's environment variables:

```typescript
export type EnvSchema = {
  // Server-side only variables
  SERVER_SECRET: string;
  DATABASE_URL: string;
  
  // Public variables (exposed to client)
  VITE_PUBLIC_API_URL: string;
  VITE_PUBLIC_ENV: 'development' | 'production' | 'test';
  
  // Optional variables with defaults
  VITE_DEBUG_MODE?: boolean;
};
```

### Setting Default Values

Define sensible defaults for development:

```typescript
const defaults: EnvSchema = {
  SERVER_SECRET: 'default-dev-secret-32-chars-min', // ONLY FOR DEVELOPMENT
  DATABASE_URL: 'postgres://localhost:5432/mydb',
  VITE_PUBLIC_API_URL: 'http://localhost:3000/api',
  VITE_PUBLIC_ENV: 'development',
  VITE_DEBUG_MODE: false,
};
```

### Adding Validators

Add runtime validation rules:

```typescript
const validators: { [K in keyof EnvSchema]?: (value: any) => boolean } = {
  SERVER_SECRET: (v) => typeof v === 'string' && v.length >= 32,
  DATABASE_URL: (v) => typeof v === 'string' && v.length > 0,
  VITE_PUBLIC_ENV: (v) => ['development', 'production', 'test'].includes(v),
  VITE_DEBUG_MODE: (v) => typeof v === 'boolean',
};
```

### Adding Type Transformers

Convert string values from `.env` files to their proper types:

```typescript
const transformers: { [K in keyof EnvSchema]?: (value: string) => any } = {
  VITE_DEBUG_MODE: (v) => v === 'true', // String to boolean
  VITE_PUBLIC_ENV: (v) => v.toLowerCase() as 'development' | 'production' | 'test'
};
```

## Environment Files

### Development Environment (`.env.development`)

```
VITE_PUBLIC_API_URL=http://localhost:3000/api
VITE_PUBLIC_ENV=development
VITE_DEBUG_MODE=true
```

### Production Environment (`.env.production`)

```
VITE_PUBLIC_API_URL=https://api.yourdomain.com
VITE_PUBLIC_ENV=production
VITE_DEBUG_MODE=false
```

### Local Secrets (`.env.local` - Add to .gitignore)

```
SERVER_SECRET=your-actual-production-secret
DATABASE_URL=postgres://user:password@host:port/db
```

## Handling Undefined Variables

When an environment variable exists in a `.env` file but isn't defined in the `EnvSchema` type, it will be:

- **Completely ignored** - Variables not defined in `EnvSchema` are filtered out
- **TypeScript will prevent usage** - You'll get an error if you try to access it
- **Validation safeguards** apply - Only variables defined in schema are loaded

To add a new variable:

1. Add it to `EnvSchema` type
2. Update `defaults` with a sensible default value
3. Add a validator (optional but recommended)
4. Add a transformer if needed (for non-string types)

## Best Practices

### Security

- Never commit `.env.local` files with real secrets
- Use long, secure values for `SERVER_SECRET` in production
- Set appropriate validation rules for sensitive variables

### Development

- Use descriptive names for your variables
- Group related variables in the schema
- Add JSDoc comments to complex variables

### Production

- Always validate all environment variables in production
- Set up CI/CD to validate environment configuration
- Use different variables for different environments

## Full Validators Example

Validators ensure your environment variables meet specific requirements before they're used in your application. Here's a comprehensive example of validators for different types of variables:

```typescript
const validators: { [K in keyof EnvSchema]?: (value: any) => boolean } = {
  // String validation with minimum length (for secrets)
  SERVER_SECRET: (v) => typeof v === 'string' && v.length >= 32,
  
  // Required string validation
  DATABASE_URL: (v) => typeof v === 'string' && v.length > 0,
  
  // Enum validation (restricted to specific values)
  VITE_PUBLIC_ENV: (v) => ['development', 'production', 'test'].includes(v),
  
  // Boolean validation
  VITE_DEBUG_MODE: (v) => typeof v === 'boolean',
  
  // Pattern validation (using regex)
  VITE_LOCALE: (v) => /^[a-z]{2}-[A-Z]{2}$/.test(v),
  
  // URL validation
  VITE_PUBLIC_API_URL: (v) => {
    try {
      new URL(v);
      return true;
    } catch (error) {
      return false;
    }
  },
  
  // Number range validation
  VITE_PORT: (v) => typeof v === 'number' && v >= 1024 && v <= 65535,
  
  // Array validation
  VITE_ALLOWED_ORIGINS: (v) => Array.isArray(v) && v.length > 0,
  
  // Object validation
  VITE_CONFIG: (v) => {
    if (typeof v !== 'object' || v === null) return false;
    return 'apiUrl' in v && typeof v.apiUrl === 'string';
  }
};
```

When validation fails for a variable, ViteEnvManager will:
1. Log a warning to the console
2. Fall back to the default value for that variable
3. Continue running rather than throwing errors

This ensures your application won't crash due to environment misconfiguration, while still alerting developers to the issue.

## Full Transformers Example

Transformers convert raw string values from `.env` files into proper TypeScript types. Here's a comprehensive example:

```typescript
const transformers: { [K in keyof EnvSchema]?: (value: string) => any } = {
  // Boolean transformation
  VITE_DEBUG_MODE: (v) => v === 'true',
  
  // Enum transformation with normalization
  VITE_PUBLIC_ENV: (v) => v.toLowerCase() as 'development' | 'production' | 'test',
  
  // Number transformation
  VITE_PORT: (v) => parseInt(v, 10),
  
  // Array transformation (comma-separated values)
  VITE_ALLOWED_ORIGINS: (v) => v.split(',').map(origin => origin.trim()),
  
  // JSON transformation
  VITE_CONFIG: (v) => JSON.parse(v),
  
  // Date transformation
  VITE_RELEASE_DATE: (v) => new Date(v),
  
  // Custom object transformation
  VITE_API_KEYS: (v) => {
    const keyPairs = v.split(',');
    return keyPairs.reduce((obj, pair) => {
      const [key, value] = pair.split(':').map(s => s.trim());
      obj[key] = value;
      return obj;
    }, {} as Record<string, string>);
  }
};
```

### Practical Examples

#### Boolean Values

```
# In .env file
VITE_DEBUG_MODE=true

# Transformer
const transformers = {
  VITE_DEBUG_MODE: (v) => v === 'true', // Converts "true" → true
};

# Usage
if (env.VITE_DEBUG_MODE) {
  console.log('Debug mode enabled');
} else {
  console.log('Debug mode disabled');
}
```

#### Number Values

```
# In .env file
VITE_PORT=8080

# Transformer
const transformers = {
  VITE_PORT: (v) => parseInt(v, 10), // Converts "8080" → 8080
};

# Usage
const server = createServer();
server.listen(env.VITE_PORT);
console.log(`Server running on port ${env.VITE_PORT}`);
```

#### Array Values

```
# In .env file
VITE_ALLOWED_ORIGINS=http://localhost:3000,https://example.com

# Transformer
const transformers = {
  VITE_ALLOWED_ORIGINS: (v) => v.split(','),
};

# Usage
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || env.VITE_ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
};
```

#### JSON Values

```
# In .env file
VITE_CONFIG={"apiUrl":"https://api.example.com","timeout":5000,"retries":3}

# Transformer
const transformers = {
  VITE_CONFIG: (v) => JSON.parse(v),
};

# Usage
const apiClient = createClient({
  baseURL: env.VITE_CONFIG.apiUrl,
  timeout: env.VITE_CONFIG.timeout,
  retries: env.VITE_CONFIG.retries
});
```

#### Complex Custom Transformation

```
# In .env file
VITE_API_KEYS=stripe:sk_test_123,twilio:ab12cd34,sendgrid:SG.efgh5678

# Transformer
const transformers = {
  VITE_API_KEYS: (v) => {
    const keyPairs = v.split(',');
    return keyPairs.reduce((obj, pair) => {
      const [key, value] = pair.split(':').map(s => s.trim());
      obj[key] = value;
      return obj;
    }, {} as Record<string, string>);
  }
};

# Usage
const stripeClient = new Stripe(env.VITE_API_KEYS.stripe);
const twilioClient = new Twilio(env.VITE_API_KEYS.twilio);
```

## License

MIT