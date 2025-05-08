# ViteEnv User Manual
0.1.0-beta.1 

## Adding and Using Environment Variables

This user manual provides step-by-step instructions on how to add and use environment variables in your application using the ViteEnv manager.

## Table of Contents

1. [Introduction](#introduction)
2. [Environment Variable Types](#environment-variable-types)
3. [Adding a New Environment Variable](#adding-a-new-environment-variable)
4. [Using Environment Variables](#using-environment-variables)
5. [Environment Files (.env)](#environment-files)
6. [Debugging Environment Variables](#debugging-environment-variables)
7. [Troubleshooting](#troubleshooting)

## Introduction

ViteEnv is a secure, type-safe environment variable manager for Vite-based applications like Remix. It provides a centralized way to manage environment variables with features like:

- Single source of truth for all environment variables
- Type safety with TypeScript
- Runtime validation
- Default values for development
- Clear separation between server and client variables

## Environment Variable Types

ViteEnv supports two types of environment variables:

1. **Server-side only variables**: 
   - Not prefixed with `VITE_`
   - Only available in server code (loaders, actions)
   - Not exposed to the client browser
   - Example: `DATABASE_URL`, `SERVER_SECRET`

2. **Client-side variables**: 
   - Must be prefixed with `VITE_`
   - Available in both server and client code
   - Exposed to the browser (not secure for secrets)
   - Example: `VITE_PUBLIC_API_URL`, `VITE_DEBUG_MODE`

## Adding a New Environment Variable

To add a new environment variable, you need to:

### 1. Update the EnvSchema in `app/core/ViteEnv/index.ts`

Add your new variable to the EnvSchema type definition:

```typescript
export type EnvSchema = {
  // Existing variables...
  
  // Server-side only 
  MY_NEW_SERVER_VAR: string;
  
  // Client-side
  VITE_MY_NEW_CLIENT_VAR: string;
};
```

### 2. Add a Default Value

In the same file, add a default value to the `defaults` object:

```typescript
const defaults: Required<EnvSchema> = {
  // Existing defaults...
  
  MY_NEW_SERVER_VAR: 'default-value',
  VITE_MY_NEW_CLIENT_VAR: 'client-default',
};
```

### 3. Add Validators (Optional but Recommended)

Add validation rules for your new variables:

```typescript
const validators: Record<keyof EnvSchema, GenericValidator> = {
  // Existing validators...
  
  MY_NEW_SERVER_VAR: (value: string) => ({
    valid: value.length > 0,
    message: 'Server variable must not be empty'
  }),
  
  VITE_MY_NEW_CLIENT_VAR: (value: string) => ({
    valid: typeof value === 'string',
    message: 'Client variable must be a string'
  }),
};
```

### 4. Add Transformers (Only if Needed)

If your variable requires transformation (e.g., converting a string to a boolean or number):

```typescript
const transformers: Partial<Record<keyof EnvSchema, Transformer<any>>> = {
  // Existing transformers...
  
  VITE_MY_NEW_CLIENT_VAR: {
    parse: (v) => {
      // Apply transformation logic here
      return v === 'true' ? true : false;
    },
    validate: validators.VITE_MY_NEW_CLIENT_VAR
  },
};
```

### 5. For Client-Side Access: Update the Vite Config

For client-side access to variables not prefixed with `VITE_`, edit `vite.config.ts`:

```typescript
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd());
  
  return {
    // Existing config...
    
    define: {
      // Existing definitions...
      'process.env.MY_NEW_SERVER_VAR': JSON.stringify(env.MY_NEW_SERVER_VAR || defaults.MY_NEW_SERVER_VAR),
    }
  };
});
```

### 6. Add Type Definitions (Optional)

For better TypeScript support, add type definitions in `app/core/ViteEnv/types/env.d.ts`:

```typescript
/// <reference types="vite/client" />

// For import.meta.env
interface ImportMetaEnv {
  // Existing variables...
  readonly VITE_MY_NEW_CLIENT_VAR: string;
}

// For process.env
declare namespace NodeJS {
  interface ProcessEnv {
    // Existing variables...
    MY_NEW_SERVER_VAR: string;
  }
}
```

## Using Environment Variables

### In Server-Side Code

```typescript
// Import the ViteEnv manager
import { ViteEnv } from "~/core/ViteEnv/index";

// In a Remix loader or action
export const loader = async () => {
  const serverVar = ViteEnv.MY_NEW_SERVER_VAR;
  const clientVar = ViteEnv.VITE_MY_NEW_CLIENT_VAR;
  
  // Or using process.env
  const serverVarAlt = process.env.MY_NEW_SERVER_VAR;
  
  // Return environment variables to the component
  return {
    // Other data...
    env: {
      serverVar: serverVar,
      clientVar: clientVar
    }
  };
};
```

### Using Context in Remix

Remix provides a way to share data between routes using context. This is especially useful for environment variables that need to be accessible throughout your application:

#### 1. Set up context in the root route

In `app/root.tsx`:

```typescript
import { json } from "@remix-run/node";
import { 
  Links, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData 
} from "@remix-run/react";
import { ViteEnv } from "~/core/ViteEnv/index";

export const loader = async () => {
  // Load environment variables to be shared app-wide
  return json({
    env: {
      KRATOS_BASE_URL: ViteEnv.KRATOS_BASE_URL,
      PUBLIC_ENV: ViteEnv.VITE_PUBLIC_ENV,
      // Add other environment variables here
    }
  });
};

export default function App() {
  const data = useLoaderData<typeof loader>();
  
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {/* Pass env to all child routes via context */}
        <Outlet context={data} />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
```

#### 2. Access context in child routes

In any child route:

```typescript
import { useOutletContext } from "@remix-run/react";

// Define the context type
type ContextType = {
  env: {
    KRATOS_BASE_URL: string;
    PUBLIC_ENV: string;
    // Other environment variables
  }
};

export default function ChildRoute() {
  // Access environment variables from context
  const { env } = useOutletContext<ContextType>();
  
  return (
    <div>
      <p>Using env from context: {env.KRATOS_BASE_URL}</p>
    </div>
  );
}
```

### In Client-Side Code

#### For VITE_ Prefixed Variables

```typescript
// These work in any component file
const clientVar = import.meta.env.VITE_MY_NEW_CLIENT_VAR;

// Or using ViteEnv
import { ViteEnv } from "~/core/ViteEnv/index";
const clientVarAlt = ViteEnv.VITE_MY_NEW_CLIENT_VAR;
```

#### For Server Variables Exposed via define

```typescript
// Only if added to define in vite.config.ts
const serverVar = process.env.MY_NEW_SERVER_VAR;
```

## Environment Files

Add your variables to the appropriate .env files:

### .env (Base Environment - Loaded in All Cases)

```
MY_NEW_SERVER_VAR=base-value
VITE_MY_NEW_CLIENT_VAR=base-client-value
```

### .env.development (Development Mode)

```
MY_NEW_SERVER_VAR=development-value
VITE_MY_NEW_CLIENT_VAR=dev-client-value
```

### .env.production (Production Mode)

```
MY_NEW_SERVER_VAR=production-value
VITE_MY_NEW_CLIENT_VAR=prod-client-value
```

### .env.local (Local Overrides - Not Committed to Git)

```
MY_NEW_SERVER_VAR=local-value
VITE_MY_NEW_CLIENT_VAR=local-client-value
```

## Debugging Environment Variables

The application includes a debug route specifically designed to help you verify and troubleshoot environment variables. This route displays all available environment variables in both server and client contexts.

### Using the Debug Route

1. Visit `/debug-env` in your application
2. The page is divided into two main sections:
   - **Server-Side Environment (SSR)**: Shows variables available during server-side rendering
   - **Client-Side Environment**: Shows variables available in the browser

3. Each section displays variables from different sources:
   - **process.env variables**: Environment variables accessed via Node.js process.env
   - **import.meta.env variables**: Client-side variables provided by Vite (VITE_ prefixed)
   - **ViteEnv manager variables**: Variables accessed through your ViteEnv manager

4. Only variables with actual values are displayed (undefined variables are filtered out)
5. Sensitive variables containing keywords like SECRET, PASSWORD, etc. are marked as [REDACTED]

### Sample Debug Route Output

Here's an example of what you might see when visiting `/debug-env`:

#### Server-Side Environment (SSR)

**process.env variables:**
```json
{
  "NODE_ENV": "development",
  "KRATOS_BASE_URL": "http://localhost:4433",
  "TIMEZONE": "America/Mexico_City",
  "LOCALE": "es-MX",
  "MY_NEW_SERVER_VAR": "server-test-value"
}
```

**ViteEnv manager variables:**
```json
{
  "KRATOS_BASE_URL": "http://localhost:4433",
  "TIMEZONE": "America/Mexico_City",
  "LOCALE": "es-MX",
  "MY_NEW_SERVER_VAR": "server-test-value",
  "VITE_PUBLIC_API_URL": "http://localhost:3000/api",
  "VITE_PUBLIC_ENV": "development",
  "VITE_DEBUG_MODE": true,
  "VITE_LOCALE": "en-US",
  "VITE_MY_NEW_CLIENT_VAR": "client-test-value"
}
```

#### Client-Side Environment

**process.env variables:**
```json
{
  "NODE_ENV": "development",
  "KRATOS_BASE_URL": "http://localhost:4433",
  "MY_NEW_SERVER_VAR": "server-test-value"
}
```

**import.meta.env variables:**
```json
{
  "MODE": "development",
  "DEV": true,
  "PROD": false,
  "SSR": false,
  "VITE_PUBLIC_API_URL": "http://localhost:3000/api",
  "VITE_PUBLIC_ENV": "development",
  "VITE_DEBUG_MODE": "true",
  "VITE_LOCALE": "en-US",
  "VITE_MY_NEW_CLIENT_VAR": "client-test-value"
}
```

**ViteEnv manager variables:**
```json
{
  "KRATOS_BASE_URL": "http://localhost:4433",
  "VITE_PUBLIC_API_URL": "http://localhost:3000/api",
  "VITE_PUBLIC_ENV": "development",
  "VITE_DEBUG_MODE": true,
  "VITE_LOCALE": "en-US",
  "VITE_MY_NEW_CLIENT_VAR": "client-test-value"
}
```

### Notes on the Debug Output

From this example output, you can observe:

1. **Server-side access**:
   - All environment variables are accessible on the server
   - ViteEnv manager provides access to both server and client variables

2. **Client-side access**:
   - `process.env` only shows variables defined in `vite.config.ts` using the `define` option
   - `import.meta.env` shows all VITE_ prefixed variables plus Vite's built-in variables
   - ViteEnv manager can access client variables and server variables exposed via define

3. **Type differences**:
   - Note how `VITE_DEBUG_MODE` is `true` (boolean) in ViteEnv but `"true"` (string) in import.meta.env
   - This demonstrates how transformers convert string values to their proper types

### Implementation Details

The debug route (`app/routes/debug-env.tsx`) works by:

1. Server-side: Collecting all available environment variables in the loader
2. Client-side: Using useEffect to safely check for variables in the browser
3. Dynamically checking for variables from multiple sources
4. Filtering out undefined values for cleaner display
5. Protecting sensitive information

### Troubleshooting with the Debug Route

If variables are missing or undefined, check:

- **For Server-Side Variables**:
  - Verify the variable is defined in your .env files
  - Check that the variable is added to the EnvSchema
  - Ensure the variable has a default value
  - Restart the server after making changes

- **For Client-Side Variables**:
  - For VITE_ prefixed variables: Ensure they're defined in .env files
  - For other variables: Verify they're added to the `define` section in vite.config.ts
  - Check the browser console for any errors

You can also modify the debug route to check for specific variables by adding them to the `allVarNames` set in the client-side code.

## Advanced ViteEnv Features

The ViteEnv manager provides several utility functions for dynamic environment management and debugging. These are particularly useful during development and testing.

### Setting Environment Variables at Runtime

ViteEnv provides a `setEnv` function that allows you to dynamically change environment variables at runtime:

```typescript
import { setEnv } from "~/core/ViteEnv/index";

// Set an environment variable
setEnv('VITE_DEBUG_MODE', true);

// Set a server-side variable
setEnv('KRATOS_BASE_URL', 'http://localhost:5000');
```

#### How setEnv Works

The `setEnv` function performs the following:

1. Validates the new value using the validator for that variable (if available)
2. Updates the internal environment variable map
3. Updates the appropriate environment source (process.env or import.meta.env)
4. Returns a result indicating success or failure with an optional error message

#### Example with Error Handling

```typescript
import { setEnv } from "~/core/ViteEnv/index";

const result = setEnv('VITE_DEBUG_MODE', 'not-a-boolean');

if (!result.success) {
  console.error(`Failed to set environment variable: ${result.message}`);
} else {
  console.log('Environment variable updated successfully');
}
```

#### Use Cases for setEnv

- Testing how different environment values affect your application
- Toggling features dynamically during development
- Setting up test-specific environments in integration tests
- Allowing users to customize some environment settings at runtime

#### Limitations

- Changes made with `setEnv` are not persistent across server restarts
- Client-side changes only affect the current browser session
- Some environment variables may be read only once during initialization

### Debugging Environment Variables

ViteEnv includes a `debugEnv` function that provides detailed information about all environment variables, including their sources and validation status:

```typescript
import { debugEnv } from "~/core/ViteEnv/index";

// Get detailed information about all environment variables
const envInfo = debugEnv();
console.log(envInfo);
```

#### Example debugEnv Output

The output is an object containing detailed information about each variable:

```json
{
  "KRATOS_BASE_URL": {
    "value": "http://localhost:4433",
    "source": "env",
    "valid": true
  },
  "VITE_DEBUG_MODE": {
    "value": true,
    "source": "default",
    "valid": true
  },
  "SERVER_SECRET": {
    "value": "default-secret",
    "source": "default", 
    "valid": false
  }
}
```

Each entry provides:
- **value**: The current value of the variable
- **source**: Where the value came from
  - **"env"**: Loaded from environment files
  - **"default"**: Using the default value defined in ViteEnv
  - **"manual"**: Set manually using setEnv
- **valid**: Whether the value passes the validation rules

#### Use Cases for debugEnv

- Troubleshooting issues with environment configuration
- Identifying which variables are using default values
- Finding validation errors in environment variables
- Understanding environment variable precedence

#### Example: Logging Invalid Environment Variables

```typescript
import { debugEnv } from "~/core/ViteEnv/index";

// Find and log all invalid environment variables
const envInfo = debugEnv();
const invalidVars = Object.entries(envInfo)
  .filter(([_, info]) => !info.valid)
  .map(([key, info]) => ({
    name: key,
    value: info.value,
    source: info.source
  }));

if (invalidVars.length > 0) {
  console.warn('Invalid environment variables found:', invalidVars);
}
```

### Combining setEnv and debugEnv

These utilities work well together for development and debugging:

```typescript
import { setEnv, debugEnv } from "~/core/ViteEnv/index";

// Log initial environment state
console.log('Initial environment:', debugEnv());

// Update a variable
setEnv('VITE_DEBUG_MODE', true);

// Log environment state after change
console.log('Updated environment:', debugEnv());
```

This pattern is particularly useful when investigating how changes to environment variables affect your application's behavior.