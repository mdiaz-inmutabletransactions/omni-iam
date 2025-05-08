README - ViteEnvManager Implementation Guide
0.1.0-beta.1 
Overview
The ViteEnvManager is a robust, type-safe environment variable management system designed for Vite + Remix applications. It provides centralized control over environment variables with full TypeScript support, validation, and transformation capabilities.

Key Benefits
Single Source of Truth: All environment variables managed in one place

Type Safety: Full TypeScript support with autocomplete

Validation: Runtime checks for critical variables

Separation of Concerns: Clear server vs. client separation

Default Values: Graceful fallbacks for missing variables

Testability: Easy to mock in tests

Security: Only exposes public variables to client

Implementation Details
Environment Schema
Defined in src/core/env.ts, the schema specifies all environment variables:

typescript
export type EnvSchema = {
  // Server-side only
  SERVER_SECRET: string;
  DATABASE_URL: string;
  TIMEZONE: string;
  LOCALE: string;
  KARTOS_BASE_URL: string;
  
  // Client-side (public)
  VITE_PUBLIC_API_URL: string;
  VITE_PUBLIC_ENV: 'development' | 'production' | 'test';
  
  // Optional with defaults
  VITE_DEBUG_MODE?: boolean;
  VITE_LOCALE?: string;
};
Default Values
Provides sensible development fallbacks:

typescript
const defaults: EnvSchema = {
  SERVER_SECRET: 'default-secret',
  DATABASE_URL: 'postgres://localhost:5432/mydb',
  VITE_PUBLIC_API_URL: 'http://localhost:3000/api',
  VITE_PUBLIC_ENV: 'development',
  VITE_DEBUG_MODE: false,
  VITE_LOCALE: 'en-US',
  TIMEZONE: 'America/Mexico_City',
  LOCALE: 'es-MX',
  KARTOS_BASE_URL: 'http://localhost:3000'
};
Validation Rules
Ensures variables meet requirements:

typescript
const validators = {
  SERVER_SECRET: (v) => typeof v === 'string' && v.length >= 32,
  DATABASE_URL: (v) => typeof v === 'string' && v.length > 0,
  // ... other validators
};
Value Transformers
Converts raw strings to proper types:

typescript
const transformers = {
  VITE_DEBUG_MODE: (v) => v === 'true',
  VITE_PUBLIC_ENV: (v) => v.toLowerCase() as 'development' | 'production' | 'test'
};
Usage Guide
Accessing Variables
typescript
import { env } from '~/core/env';

// Server-side usage
const dbUrl = env.DATABASE_URL;

// Client-side usage
const apiUrl = env.VITE_PUBLIC_API_URL;
Setting Variables (Testing/Mocks)
typescript
import { setEnv } from '~/core/env';

setEnv('VITE_DEBUG_MODE', true);
Reloading Environment
typescript
import { reloadEnv } from '~/core/env';

reloadEnv(); // Refreshes all environment variables
Environment File Handling
Loading Order
Vite loads .env files in this priority:

.env.${mode}.local

.env.${mode}

.env.local

.env

Variable Rules
Server-side variables: No prefix (SERVER_SECRET)

Client-side variables: Must be prefixed with VITE_

Variables not in EnvSchema are ignored

Best Practices
Adding New Variables
Add to EnvSchema type

Define default value

Add validator if needed

Add transformer if type conversion required

Security
Never commit .env.local to version control

Mark server-side defaults clearly as development-only

Only expose necessary variables to client

Troubleshooting
Common Issues
"module is not defined" in SSR:

Ensure proper Vite SSR configuration

Clear cache (rm -rf node_modules/.vite)

Type Errors:

Verify variable exists in EnvSchema

Check validator and transformer functions

Missing Variables:

Confirm .env file exists

Check variable naming matches schema

Example .env File
env
# Server-side
SERVER_SECRET=your-production-secret-32-chars-min
DATABASE_URL=postgres://user:pass@prod-db:5432/prod

# Client-side
VITE_PUBLIC_API_URL=https://api.example.com
VITE_PUBLIC_ENV=production
This implementation provides a production-ready environment management system that works seamlessly with Vite's built-in features while maintaining type safety and security.

Validators and Transformers - Complete Examples
1. Validators Deep Dive
Current Validators Implementation
typescript
const validators: { [K in keyof EnvSchema]?: (value: any) => boolean } = {
  SERVER_SECRET: (v) => typeof v === 'string' && v.length >= 32,
  DATABASE_URL: (v) => typeof v === 'string' && v.length > 0,
  VITE_PUBLIC_ENV: (v) => ['development', 'production', 'test'].includes(v),
  VITE_DEBUG_MODE: (v) => typeof v === 'boolean',
  VITE_LOCALE: (v) => /^[a-z]{2}-[A-Z]{2}$/.test(v),
  TIMEZONE: (v) => typeof v === 'string',
  LOCALE: (v) => typeof v === 'string',
  KARTOS_BASE_URL: (v) => typeof v === 'string',
};
Enhanced Validators with Error Messages
typescript
const validators = {
  SERVER_SECRET: {
    validate: (v: unknown) => typeof v === 'string' && v.length >= 32,
    message: 'Server secret must be at least 32 characters'
  },
  DATABASE_URL: {
    validate: (v: unknown) => {
      if (typeof v !== 'string') return false;
      try {
        new URL(v);
        return true;
      } catch {
        return false;
      }
    },
    message: 'Database URL must be a valid connection string'
  },
  VITE_PUBLIC_ENV: {
    validate: (v: unknown) => ['development', 'production', 'test'].includes(v as string),
    message: 'Environment must be development, production, or test'
  },
  // ... other validators
};

// Usage in validateEnvironment()
private validateEnvironment(): void {
  for (const [key, validator] of Object.entries(validators)) {
    const envKey = key as keyof EnvSchema;
    const value = this.env[envKey];
    
    if (!validator.validate(value)) {
      console.error(`Invalid ${key}: ${validator.message}`);
      this.env[envKey] = defaults[envKey];
    }
  }
}
2. Transformers Deep Dive
Current Transformers Implementation
typescript
const transformers: { [K in keyof EnvSchema]?: (value: string) => any } = {
  VITE_DEBUG_MODE: (v) => v === 'true',
  VITE_PUBLIC_ENV: (v) => v.toLowerCase() as 'development' | 'production' | 'test'
};
Enhanced Transformers with Error Handling
typescript
const transformers = {
  VITE_DEBUG_MODE: {
    transform: (v: string) => {
      if (v === 'true') return true;
      if (v === 'false') return false;
      throw new Error('Invalid boolean value');
    },
    fallback: false
  },
  VITE_PUBLIC_ENV: {
    transform: (v: string) => {
      const env = v.toLowerCase();
      if (['development', 'production', 'test'].includes(env)) {
        return env as 'development' | 'production' | 'test';
      }
      throw new Error('Invalid environment value');
    },
    fallback: 'development'
  },
  VITE_API_TIMEOUT: {
    transform: (v: string) => {
      const num = parseInt(v, 10);
      if (isNaN(num)) throw new Error('Must be a number');
      return num;
    },
    fallback: 5000
  },
  VITE_ALLOWED_ORIGINS: {
    transform: (v: string) => v.split(',').map(s => s.trim()),
    fallback: []
  },
  VITE_FEATURE_FLAGS: {
    transform: (v: string) => {
      try {
        return JSON.parse(v);
      } catch {
        throw new Error('Invalid JSON');
      }
    },
    fallback: {}
  }
};

// Usage in loadEnvironment()
private loadEnvironment(): EnvSchema {
  const loaded = { ...defaults };

  for (const key of Object.keys(defaults) as Array<keyof EnvSchema>) {
    const rawValue = key.startsWith('VITE_') 
      ? import.meta.env[key]
      : process.env[key];

    if (rawValue === undefined) continue;

    const transformer = transformers[key];
    try {
      loaded[key] = transformer 
        ? transformer.transform(rawValue)
        : rawValue;
    } catch (error) {
      console.warn(`Transform failed for ${key}:`, error.message);
      if (transformer?.fallback !== undefined) {
        loaded[key] = transformer.fallback;
      }
    }
  }

  return loaded;
}
3. Complex Validation Examples
URL Validation
typescript
{
  KARTOS_BASE_URL: {
    validate: (v: unknown) => {
      if (typeof v !== 'string') return false;
      try {
        const url = new URL(v);
        return ['http:', 'https:'].includes(url.protocol);
      } catch {
        return false;
      }
    },
    message: 'Must be a valid HTTP/HTTPS URL'
  }
}
Date/Time Validation
typescript
{
  CACHE_EXPIRY: {
    validate: (v: unknown) => {
      if (typeof v !== 'string') return false;
      return /^\d+[smhd]$/.test(v); // e.g., "30s", "5m", "1h", "7d"
    },
    transform: (v: string) => {
      const unit = v.slice(-1);
      const value = parseInt(v.slice(0, -1), 10);
      return { value, unit };
    },
    fallback: { value: 30, unit: 'm' }
  }
}
Complex Object Validation
typescript
{
  FEATURE_FLAGS: {
    validate: (v: unknown) => {
      if (typeof v !== 'object' || v === null) return false;
      return Object.values(v).every(flag => typeof flag === 'boolean');
    },
    transform: (v: string) => {
      try {
        const parsed = JSON.parse(v);
        return Object.fromEntries(
          Object.entries(parsed).map(([k, v]) => [k, Boolean(v)]
        );
      } catch {
        throw new Error('Invalid feature flags format');
      }
    },
    fallback: {}
  }
}
4. Real-World Usage Examples
Setting Up Feature Flags
env
VITE_FEATURE_FLAGS='{"newDashboard":true,"darkMode":false}'
typescript
if (env.VITE_FEATURE_FLAGS.newDashboard) {
  // Enable new dashboard
}
Configuring API Timeouts
env
VITE_API_TIMEOUT=10000
VITE_API_RETRIES=3
typescript
axios.defaults.timeout = env.VITE_API_TIMEOUT;
axios.defaults.retry = env.VITE_API_RETRIES;
Handling Localization
env
VITE_SUPPORTED_LOCALES=en-US,es-MX,fr-FR
VITE_DEFAULT_LOCALE=en-US
typescript
const locales = env.VITE_SUPPORTED_LOCALES; // ['en-US', 'es-MX', 'fr-FR']
const defaultLocale = env.VITE_DEFAULT_LOCALE; // 'en-US'
These examples demonstrate how to build a robust environment variable system with:

Strong type safety

Comprehensive validation

Flexible transformation

Clear error handling

Sensible defaults

The system can handle everything from simple flags to complex JSON configurations while maintaining type safety and runtime validation.