// src/core/env.ts
type EnvSource = 'env' | 'default' | 'manual';

type EnvValue<T> = {
  value: T;
  source: EnvSource;
  valid: boolean;
};

export type EnvSchema = {
    // Server-side only (only available in Remix loaders/actions)
    SERVER_SECRET: string;
    DATABASE_URL: string;
    TIMEZONE: string;
    LOCALE: string;
    KRATOS_BASE_URL: string;
  
    // Public (exposed to client)
    VITE_PUBLIC_API_URL: string;
    VITE_PUBLIC_ENV: 'development' | 'production' | 'test';
    
    // Optional with defaults
    VITE_DEBUG_MODE?: boolean;
    VITE_LOCALE?: string;
};

const defaults: Required<EnvSchema> = {
  SERVER_SECRET: 'default-secret',
  DATABASE_URL: 'postgres://localhost:5432/mydb',
  VITE_PUBLIC_API_URL: 'http://localhost:3000/api',
  VITE_PUBLIC_ENV: 'development',
  VITE_DEBUG_MODE: false,
  VITE_LOCALE: 'en-US',
  TIMEZONE: 'America/Mexico_City',
  LOCALE: 'es-MX',
  KRATOS_BASE_URL: 'http://localhost:4455',
};

// Generic validator function type
type GenericValidator = (value: any) => { valid: boolean; message?: string };

const validators: Record<keyof EnvSchema, GenericValidator> = {
  SERVER_SECRET: (value: string) => ({
    valid: value.length >= 32,
    message: 'Server secret must be at least 32 characters'
  }),
  DATABASE_URL: (value: string) => ({
    valid: value.startsWith('postgres://') || value.startsWith('mysql://'),
    message: 'Invalid database URL format'
  }),
  TIMEZONE: (value: string) => ({
    valid: Intl.supportedValuesOf('timeZone').includes(value),
    message: 'Unsupported timezone'
  }),
  LOCALE: (value: string) => ({
    valid: /^[a-z]{2}-[A-Z]{2}$/.test(value),
    message: 'Locale must be in format xx-XX'
  }),
  KRATOS_BASE_URL: (value: string) => ({
    valid: /^https?:\/\/.+/i.test(value),
    message: 'Invalid URL format'
  }),
  VITE_PUBLIC_API_URL: (value: string) => ({
    valid: /^https?:\/\/.+/i.test(value),
    message: 'Invalid API URL format'
  }),
  VITE_PUBLIC_ENV: (value: 'development' | 'production' | 'test') => ({
    valid: ['development', 'production', 'test'].includes(value),
    message: 'Environment must be development/production/test'
  }),
  VITE_DEBUG_MODE: (value: boolean) => ({
    valid: typeof value === 'boolean',
    message: 'Debug mode must be boolean'
  }),
  VITE_LOCALE: (value?: string) => ({
    valid: value === undefined || /^[a-z]{2}-[A-Z]{2}$/.test(value),
    message: 'Locale must be in format xx-XX'
  })
};

type Transformer<T> = {
  parse: (raw: string) => T;
  validate: GenericValidator;
};

const transformers: Partial<Record<keyof EnvSchema, Transformer<any>>> = {
  VITE_PUBLIC_ENV: {
    parse: (v) => {
      const env = v.toLowerCase();
      if (env === 'development' || env === 'production' || env === 'test') {
        return env as 'development' | 'production' | 'test';
      }
      throw new Error(`Invalid environment: ${v}`);
    },
    validate: validators.VITE_PUBLIC_ENV
  },
  VITE_DEBUG_MODE: {
    parse: (v) => v === 'true',
    validate: validators.VITE_DEBUG_MODE
  },
  VITE_LOCALE: {
    parse: (v) => {
      if (!/^[a-z]{2}-[A-Z]{2}$/.test(v)) {
        throw new Error(`Invalid locale format: ${v}`);
      }
      return v;
    },
    validate: validators.VITE_LOCALE
  }
};

class ViteEnvManager {
  private static instance: ViteEnvManager;
  private env: Map<keyof EnvSchema, EnvValue<any>>;
  
  private constructor() {
    this.env = this.loadEnvironment();
  }

  private loadEnvironment(): Map<keyof EnvSchema, EnvValue<any>> {
    const envMap = new Map<keyof EnvSchema, EnvValue<any>>();

    (Object.keys(defaults) as Array<keyof EnvSchema>).forEach((key) => {
      // Fix for environment variable access - handle both server and client side properly
      let rawValue: string | undefined;
      
      if (key.startsWith('VITE_')) {
        // Client-side environment variables
        // Check if running in browser context
        if (typeof window !== 'undefined' && 'import' in window) {
          rawValue = (import.meta.env as any)[key];
        } else if (typeof process !== 'undefined' && process.env) {
          // Server-side access to VITE_ variables (during SSR)
          rawValue = process.env[key];
        }
      } else {
        // Server-side only environment variables
        if (typeof process !== 'undefined' && process.env) {
          rawValue = process.env[key];
        }
      }

      // Debug log to help troubleshoot
      console.debug(`Loading ${key}: raw value is ${rawValue !== undefined ? 'defined' : 'undefined'}`);
      
      if (rawValue !== undefined) {
        try {
          const transformer = transformers[key];
          let value;
          
          if (transformer) {
            value = transformer.parse(rawValue);
          } else {
            // Handle different types appropriately
            if (typeof defaults[key] === 'boolean') {
              value = rawValue === 'true';
            } else if (typeof defaults[key] === 'number') {
              value = Number(rawValue);
            } else {
              value = rawValue;
            }
          }

          // Using the validator
          const validator = validators[key];
          const validation = validator(value);

          envMap.set(key, { 
            value, 
            source: 'env', 
            valid: validation.valid 
          });

          if (!validation.valid) {
            console.warn(`Invalid ${key}: ${validation.message}`);
          }
        } catch (error) {
          console.warn(`Failed to parse ${key}:`, error instanceof Error ? error.message : error);
          console.warn(`Falling back to default value for ${key}`);
          envMap.set(key, { 
            value: defaults[key], 
            source: 'default',
            valid: true
          });
        }
      } else {
        console.debug(`Using default for ${key}: ${JSON.stringify(defaults[key])}`);
        envMap.set(key, { 
          value: defaults[key], 
          source: 'default',
          valid: true
        });
      }
    });

    return envMap;
  }

  public static get(): EnvSchema {
    if (!ViteEnvManager.instance) {
      ViteEnvManager.instance = new ViteEnvManager();
    }
    
    return Object.fromEntries(
      Array.from(ViteEnvManager.instance.env.entries())
        .map(([key, envValue]) => [key, envValue.value])
    ) as EnvSchema;
  }

  public static getWithValidation(): { 
    [K in keyof EnvSchema]: EnvValue<EnvSchema[K]> 
  } {
    if (!ViteEnvManager.instance) {
      ViteEnvManager.instance = new ViteEnvManager();
    }
    
    return Object.fromEntries(
      Array.from(ViteEnvManager.instance.env.entries())
    ) as any;
  }

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
    
    // For runtime updates
    if (key.startsWith('VITE_')) {
      if (typeof window !== 'undefined' && 'import' in window) {
        (import.meta.env as any)[key] = String(value);
      }
    }
    
    if (typeof process !== 'undefined' && process.env) {
      process.env[key] = String(value);
    }

    return { success: true };
  }

  public static validateAll(): { valid: boolean; errors: Record<string, string> } {
    if (!ViteEnvManager.instance) {
      ViteEnvManager.instance = new ViteEnvManager();
    }
    
    const errors: Record<string, string> = {};
    let valid = true;

    ViteEnvManager.instance.env.forEach((envValue, key) => {
      const validator = validators[key];
      const validation = validator(envValue.value);
      
      if (!validation.valid) {
        valid = false;
        errors[key] = validation.message || 'Invalid value';
      }
    });

    return { valid, errors };
  }

  // Add a debug method to help troubleshoot environment loading
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
}

export const ViteEnv = ViteEnvManager.get();
export const validatedEnv = ViteEnvManager.getWithValidation;
export const setEnv = ViteEnvManager.set;
export const validateEnv = ViteEnvManager.validateAll;
// Export debug function for troubleshooting
export const debugEnv = ViteEnvManager.debug;