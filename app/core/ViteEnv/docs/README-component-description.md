# ViteEnv Manager
0.1.0-beta.1 
A secure, type-safe environment variable manager for Vite-based applications (Remix)

## Adding Environment Variables

This README provides a technical guide on how to add new environment variables to the application using the ViteEnv manager.

## File Structure

```
app/
├── core/
│   └── ViteEnv/
│       ├── index.ts            # Main ViteEnv implementation
│       └── types/
│           └── env.d.ts        # TypeScript declarations for env vars
├── routes/
│   └── debug-env.tsx           # Debug route for environment variables
└── entry.server.tsx            # Server entry point
vite.config.ts                  # Vite configuration
.env                            # Environment variables
.env.development                # Development variables
.env.production                 # Production variables
```

## Steps to Add a New Environment Variable

### 1. Add to EnvSchema in `app/core/ViteEnv/index.ts`

Add your variable to the `EnvSchema` type definition:

```typescript
export type EnvSchema = {
    // Server-side only (only available in Remix loaders/actions)
    SERVER_SECRET: string;
    DATABASE_URL: string;
    TIMEZONE: string;
    LOCALE: string;
    KRATOS_BASE_URL: string;
    NEW_SERVER_VARIABLE: string; // Add your server variable here
  
    // Public (exposed to client)
    VITE_PUBLIC_API_URL: string;
    VITE_PUBLIC_ENV: 'development' | 'production' | 'test';
    VITE_NEW_CLIENT_VARIABLE: string; // Add your client variable here
    
    // Optional with defaults
    VITE_DEBUG_MODE?: boolean;
    VITE_LOCALE?: string;
};
```

### 2. Add Default Value

In the same file, add a default value to the `defaults` object:

```typescript
const defaults: Required<EnvSchema> = {
  SERVER_SECRET: 'default-secret',
  DATABASE_URL: 'postgres://localhost:5432/mydb',
  // Existing values...
  
  NEW_SERVER_VARIABLE: 'default-value',
  VITE_NEW_CLIENT_VARIABLE: 'client-default',
  
  // Rest of defaults...
};
```

### 3. Add Validators

Add validation rules in the `validators` object:

```typescript
const validators: Record<keyof EnvSchema, GenericValidator> = {
  // Existing validators...
  
  NEW_SERVER_VARIABLE: (value: string) => ({
    valid: typeof value === 'string' && value.length > 0,
    message: 'Server variable must be a non-empty string'
  }),
  
  VITE_NEW_CLIENT_VARIABLE: (value: string) => ({
    valid: typeof value === 'string',
    message: 'Client variable must be a string'
  }),
  
  // Rest of validators...
};
```

### 4. Add Transformers (If Required)

If your variable needs to be transformed from a string to another type:

```typescript
const transformers: Partial<Record<keyof EnvSchema, Transformer<any>>> = {
  // Existing transformers...
  
  VITE_NEW_CLIENT_VARIABLE: {
    parse: (v) => {
      // Example: convert "true"/"false" strings to boolean
      if (v === 'true') return true;
      if (v === 'false') return false;
      return v;
    },
    validate: validators.VITE_NEW_CLIENT_VARIABLE
  },
};
```

### 5. Update vite.config.ts for Client Access

For non-VITE_ prefixed variables or to ensure consistent values, update `vite.config.ts`:

```typescript
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { remix } from "@remix-run/dev";

export default defineConfig(({ command, mode }) => {
  // Load env file based on `mode` in the current directory
  const env = loadEnv(mode, process.cwd());
  
  return {
    plugins: [
      remix({
        // Remix config...
      }),
      tsconfigPaths(),
    ],
    
    // Define environment variables for client-side access
    define: {
      // Existing definitions...
      'process.env.KRATOS_BASE_URL': JSON.stringify(env.KRATOS_BASE_URL || 'http://localhost:4455'),
      
      // Add your new server variable if needed on client
      'process.env.NEW_SERVER_VARIABLE': JSON.stringify(env.NEW_SERVER_VARIABLE || 'default-value'),
      
      // Client variables with VITE_ prefix don't need to be defined here
      // They're automatically available via import.meta.env.VITE_NEW_CLIENT_VARIABLE
    }
  };
});
```

### 6. Add TypeScript Declarations

Create or update `app/core/ViteEnv/types/env.d.ts`:

```typescript
/// <reference types="vite/client" />

// For import.meta.env
interface ImportMetaEnv {
  readonly VITE_PUBLIC_API_URL: string;
  readonly VITE_PUBLIC_ENV: 'development' | 'production' | 'test';
  readonly VITE_DEBUG_MODE?: boolean;
  readonly VITE_LOCALE?: string;
  readonly VITE_NEW_CLIENT_VARIABLE: string; // Add your client variable
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// For process.env
declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: 'development' | 'production' | 'test';
    KRATOS_BASE_URL: string;
    SERVER_SECRET: string;
    DATABASE_URL: string;
    TIMEZONE: string;
    LOCALE: string;
    NEW_SERVER_VARIABLE: string; // Add your server variable
  }
}
```

### 7. Add Variables to Environment Files

Add your variables to the appropriate .env files:

#### .env (Base for All Environments)

```
# Server variables
NEW_SERVER_VARIABLE=base-value

# Client variables
VITE_NEW_CLIENT_VARIABLE=base-client-value
```

#### .env.development

```
# Override values for development
NEW_SERVER_VARIABLE=dev-value
VITE_NEW_CLIENT_VARIABLE=dev-client-value
```

#### .env.production

```
# Override values for production
NEW_SERVER_VARIABLE=prod-value
VITE_NEW_CLIENT_VARIABLE=prod-client-value
```

### 8. Using the Variables

#### Server-Side

```typescript
import { ViteEnv } from "~/core/ViteEnv/index";

export const loader = async () => {
  // Use variables from ViteEnv
  const serverVar = ViteEnv.NEW_SERVER_VARIABLE;
  const clientVar = ViteEnv.VITE_NEW_CLIENT_VARIABLE;
  
  // Or directly from process.env
  const serverVarAlt = process.env.NEW_SERVER_VARIABLE;
  
  // Rest of your code...
  
  // Return data including environment variables
  return json({
    // Other data...
    env: {
      serverVar,
      clientVar
    }
  });
};
```

#### Using Remix Context for Environment Variables

For app-wide environment variables, set them up in the root route:

```typescript
// app/root.tsx
import { json } from "@remix-run/node";
import { 
  Links, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData 
} from "@remix-run/react";
import { ViteEnv } from "~/core/ViteEnv/index";

export const loader = async () => {
  return json({
    env: {
      KRATOS_BASE_URL: ViteEnv.KRATOS_BASE_URL,
      // Add other variables as needed
    }
  });
};

export default function App() {
  const data = useLoaderData<typeof loader>();
  
  return (
    <html lang="en">
      {/* ... head content ... */}
      <body>
        {/* Pass env to all routes via context */}
        <Outlet context={data} />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
```

Access the variables in any child route:

```typescript
// In any route component
import { useOutletContext } from "@remix-run/react";

type ContextType = {
  env: {
    KRATOS_BASE_URL: string;
    // Other env vars
  }
};

export default function SomeRoute() {
  const { env } = useOutletContext<ContextType>();
  
  return (
    <div>
      <p>KRATOS_BASE_URL: {env.KRATOS_BASE_URL}</p>
    </div>
  );
}
```

#### Client-Side

```typescript
import { ViteEnv } from "~/core/ViteEnv/index";

// For VITE_ prefixed variables
const clientVar = import.meta.env.VITE_NEW_CLIENT_VARIABLE;
// Or
const clientVarAlt = ViteEnv.VITE_NEW_CLIENT_VARIABLE;

// For server variables exposed via vite.config.ts define
const serverVar = process.env.NEW_SERVER_VARIABLE;
```

## Verifying Environment Variables with the Debug Route

The application includes a specialized debug route at `/debug-env` that provides a comprehensive view of all environment variables:

### Debug Route Features

- **Path**: `/debug-env` in your application
- **Implementation file**: `app/routes/debug-env.tsx`
- **Purpose**: Visual inspection and verification of all environment variables

### What the Debug Route Shows

1. **Server-Side Environment (SSR)**:
   - `process.env` variables available to Node.js
   - ViteEnv manager variables
   
2. **Client-Side Environment**:
   - `process.env` variables available in browser (from vite.config.ts define)
   - `import.meta.env` variables (VITE_ prefixed)
   - ViteEnv manager variables on client

### Example Debug Route Output

Here's an example of what you might see when visiting `/debug-env`:

#### Server-Side Environment (SSR)

**process.env variables:**
```json
{
  "NODE_ENV": "development",
  "KRATOS_BASE_URL": "http://localhost:4433",
  "TIMEZONE": "America/Mexico_City",
  "LOCALE": "es-MX",
  "NEW_SERVER_VARIABLE": "dev-server-value",
  "PORT": "4455"
}
```

**ViteEnv manager variables:**
```json
{
  "KRATOS_BASE_URL": "http://localhost:4433",
  "TIMEZONE": "America/Mexico_City",
  "LOCALE": "es-MX",
  "NEW_SERVER_VARIABLE": "dev-server-value",
  "VITE_PUBLIC_API_URL": "http://localhost:3000/api",
  "VITE_PUBLIC_ENV": "development",
  "VITE_DEBUG_MODE": true,
  "VITE_NEW_CLIENT_VARIABLE": "dev-client-value"
}
```

#### Client-Side Environment

**process.env variables:**
```json
{
  "NODE_ENV": "development",
  "KRATOS_BASE_URL": "http://localhost:4433",
  "NEW_SERVER_VARIABLE": "dev-server-value"
}
```

**import.meta.env variables:**
```json
{
  "MODE": "development",
  "DEV": true,
  "PROD": false,
  "BASE_URL": "/",
  "VITE_PUBLIC_API_URL": "http://localhost:3000/api",
  "VITE_PUBLIC_ENV": "development",
  "VITE_DEBUG_MODE": "true",
  "VITE_NEW_CLIENT_VARIABLE": "dev-client-value"
}
```

**ViteEnv manager variables:**
```json
{
  "KRATOS_BASE_URL": "http://localhost:4433",
  "VITE_PUBLIC_API_URL": "http://localhost:3000/api",
  "VITE_PUBLIC_ENV": "development",
  "VITE_DEBUG_MODE": true,
  "VITE_NEW_CLIENT_VARIABLE": "dev-client-value"
}
```

### Key Observations from Output

From this example output, you can learn:

1. **Variable Access Patterns**:
   - Server-side: All variables are accessible
   - Client-side process.env: Only variables defined in vite.config.ts
   - Client-side import.meta.env: Only VITE_ prefixed variables plus Vite's built-in variables

2. **Type Differences**:
   - Note how `VITE_DEBUG_MODE` appears as `true` (boolean) in ViteEnv but `"true"` (string) in import.meta.env
   - This demonstrates the value of transformers in the ViteEnv system

3. **Availability Patterns**:
   - Some variables may be available in multiple places
   - Server-only variables (without VITE_ prefix) must be added to vite.config.ts define to be available on client

### Implementation Details

The debug route works by:

```typescript
// app/routes/debug-env.tsx
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { ViteEnv } from "~/core/ViteEnv/index";
import { useEffect, useState } from "react";

export const loader = async () => {
  // Server-side collection of environment variables
  const serverProcessEnv = getProcessEnvVariables();
  const serverViteEnv = getViteEnvVariables();
  
  // Collect all unique variable names
  const allEnvKeys = [...Object.keys(serverProcessEnv), ...Object.keys(serverViteEnv)]
    .filter((value, index, self) => self.indexOf(value) === index);
  
  return json({
    server: {
      processEnv: serverProcessEnv,
      viteEnv: serverViteEnv
    },
    allEnvKeys
  });
};

export default function DebugEnv() {
  const data = useLoaderData<typeof loader>();
  const [clientEnv, setClientEnv] = useState<{
    processEnv: Record<string, any>;
    importMetaEnv: Record<string, any>;
    viteEnv: Record<string, any>;
  } | null>(null);
  
  useEffect(() => {
    // Client-side detection of environment variables
    try {
      const processEnvVars: Record<string, any> = {};
      const importMetaEnvVars: Record<string, any> = {};
      const viteEnvVars: Record<string, any> = {};
      
      // Check for variables in different contexts
      Array.from(new Set([
        ...data.allEnvKeys,
        'NODE_ENV', 'MODE', 'DEV', 'PROD', 'BASE_URL',
        'KRATOS_BASE_URL', 'NEW_SERVER_VARIABLE',
        'VITE_PUBLIC_API_URL', 'VITE_PUBLIC_ENV', 'VITE_DEBUG_MODE', 'VITE_NEW_CLIENT_VARIABLE'
      ])).forEach(key => {
        // Check process.env
        try {
          const value = typeof process !== 'undefined' && process.env ? 
            (process.env as any)[key] : undefined;
          if (value !== undefined) processEnvVars[key] = value;
        } catch {}
        
        // Check import.meta.env
        try {
          const value = typeof import.meta !== 'undefined' && import.meta.env ? 
            (import.meta.env as any)[key] : undefined;
          if (value !== undefined) importMetaEnvVars[key] = value;
        } catch {}
        
        // Check ViteEnv
        try {
          const value = (ViteEnv as any)[key];
          if (value !== undefined) viteEnvVars[key] = value;
        } catch {}
      });
      
      setClientEnv({
        processEnv: processEnvVars,
        importMetaEnv: importMetaEnvVars,
        viteEnv: viteEnvVars
      });
    } catch (err) {
      console.error("Error accessing client environment:", err);
      setClientEnv({
        processEnv: { error: String(err) },
        importMetaEnv: { error: String(err) },
        viteEnv: { error: String(err) }
      });
    }
  }, [data.allEnvKeys]);

  // Component rendering code...
}
```

### Using the Debug Route for Troubleshooting

1. Start your development server
2. Navigate to `/debug-env` in your browser
3. Inspect which variables appear in each environment
4. Compare expected values with actual values
5. Use the debug information to correct issues:
   - Missing variables: Check .env files and EnvSchema
   - Wrong types: Check transformers
   - Missing on client: Check vite.config.ts define section
   - Values differ: Check precedence of .env files

## Runtime Environment Management

The ViteEnv system provides utilities for runtime management and debugging of environment variables.

### Using setEnv for Dynamic Environment Updates

The `setEnv` function allows you to update environment variables programmatically at runtime:

```typescript
import { setEnv } from "~/core/ViteEnv/index";

// Signature: 
// setEnv<K extends keyof EnvSchema>(key: K, value: EnvSchema[K]): { success: boolean; message?: string }

// Update a boolean value
const result = setEnv('VITE_DEBUG_MODE', true);

// Update a string value
setEnv('KRATOS_BASE_URL', 'http://localhost:5000');

// Error handling
if (!result.success) {
  console.error(`Failed to set variable: ${result.message}`);
}
```

#### Implementation Details

The `setEnv` function is implemented in `app/core/ViteEnv/index.ts`:

```typescript
public static set<K extends keyof EnvSchema>(
  key: K, 
  value: EnvSchema[K]
): { success: boolean; message?: string } {
  if (!ViteEnvManager.instance) {
    ViteEnvManager.instance = new ViteEnvManager();
  }
  
  const validator = validators[key];
  const validation = validator(value);

  if (!validation.valid) {
    return { success: false, message: validation.message };
  }

  ViteEnvManager.instance.env.set(key, { 
    value, 
    source: 'manual',
    valid: true
  });
  
  // Update relevant environment
  if (key.startsWith('VITE_')) {
    if (typeof window !== 'undefined' && 'import' in window) {
      (import.meta.env as any)[key] = String(value);
    }
  }
  
  if (typeof process !== 'undefined' && process.env) {
    process.env[key as string] = String(value);
  }

  return { success: true };
}
```

#### Use Cases

- Toggling features during development
- Setting up test environments programmatically
- Overriding environment variables for specific tests
- Creating user-configurable settings

### Using debugEnv for Troubleshooting

The `debugEnv` function provides detailed information about the current state of all environment variables:

```typescript
import { debugEnv } from "~/core/ViteEnv/index";

// Returns an object with detailed information about all environment variables
const envInfo = debugEnv();
console.log(envInfo);
```

#### Example Output

```javascript
{
  "KRATOS_BASE_URL": {
    "value": "http://localhost:4433",
    "source": "env",     // Loaded from .env file
    "valid": true
  },
  "TIMEZONE": {
    "value": "America/Mexico_City",
    "source": "default", // Using default value
    "valid": true
  },
  "SERVER_SECRET": {
    "value": "default-secret",
    "source": "default", 
    "valid": false       // Fails validation
  },
  "VITE_DEBUG_MODE": {
    "value": true,
    "source": "manual",  // Set with setEnv
    "valid": true
  }
}
```

#### Implementation Details

The `debugEnv` function is implemented in `app/core/ViteEnv/index.ts`:

```typescript
public static debug(): Record<string, { value: any; source: EnvSource; valid: boolean }> {
  if (!ViteEnvManager.instance) {
    ViteEnvManager.instance = new ViteEnvManager();
  }
  
  return Object.fromEntries(
    Array.from(ViteEnvManager.instance.env.entries())
      .map(([key, value]) => [key, { 
        value: value.value, 
        source: value.source,
        valid: value.valid 
      }])
  );
}
```

#### Troubleshooting with debugEnv

- **Missing variables**: Check if they appear in the debug output and what source they have
- **Invalid variables**: Look for `valid: false` entries and check their values
- **Source issues**: Check if variables are coming from the expected source (env, default, manual)

#### Example: Finding Invalid Configuration

```typescript
import { debugEnv } from "~/core/ViteEnv/index";

function checkEnvironmentValidity() {
  const envInfo = debugEnv();
  
  // Find any invalid configuration
  const invalidVars = Object.entries(envInfo)
    .filter(([_, info]) => !info.valid)
    .map(([key, info]) => `${key} (${info.source}): ${info.value}`);
  
  if (invalidVars.length > 0) {
    console.warn('Invalid environment variables found:', invalidVars);
    return false;
  }
  
  // Check if any variables are using defaults that shouldn't be
  const productionDefaults = Object.entries(envInfo)
    .filter(([key, info]) => 
      info.source === 'default' && 
      !key.includes('TEST') && 
      process.env.NODE_ENV === 'production'
    )
    .map(([key]) => key);
  
  if (productionDefaults.length > 0) {
    console.warn('Production using default values:', productionDefaults);
    return false;
  }
  
  return true;
}
```

### Exporting the Functions

Both functions are exported from `app/core/ViteEnv/index.ts`:

```typescript
// At the end of the file
export const ViteEnv = ViteEnvManager.get();
export const validatedEnv = ViteEnvManager.getWithValidation;
export const setEnv = ViteEnvManager.set;
export const validateEnv = ViteEnvManager.validateAll;
export const debugEnv = ViteEnvManager.debug;
```

### Integration with Testing

These functions are particularly useful in testing environments:

```typescript
// In a test setup file
import { setEnv, debugEnv } from "~/core/ViteEnv/index";

beforeEach(() => {
  // Reset to testing defaults
  setEnv('VITE_DEBUG_MODE', true);
  setEnv('KRATOS_BASE_URL', 'http://localhost:4455');
});

afterEach(() => {
  // Log environment state after each test
  console.log('Test environment:', debugEnv());
});
```