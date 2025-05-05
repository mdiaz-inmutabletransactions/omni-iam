/// <reference path="./types/env.d.ts" />


type EnvSource = 'env' | 'default' | 'manual';

type EnvValue<T> = {
  value: T;
  source: EnvSource;
  valid: boolean;
};

export type EnvSchema = {
  // Existing server-side variables
  SERVER_SECRET: string;
  DATABASE_URL: string;
  TIMEZONE: string;
  LOCALE: string;
 

  // Existing public (client) variables
  VITE_PUBLIC_API_URL: string;
  VITE_PUBLIC_ENV: 'development' | 'production' | 'test';
  VITE_DEBUG_MODE?: boolean;
  VITE_LOCALE?: string;
  KRATOS_BASE_URL: string; // Keep this exactly as it was before
  
  // New Observability variables - logging
  LOG_LEVEL: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  LOG_TARGETS: string; // Will be parsed as array in Observability
  LOG_FORMAT: 'json' | 'pretty';
  LOG_FILE_PATH: string;
  LOG_FILE_ROTATION: boolean;
  LOG_MAX_SIZE: number;
  LOG_INCLUDE_TIMESTAMP: boolean;
  LOG_INCLUDE_HOSTNAME: boolean;
  CORRELATION_ID_HEADER: string;
  REDACT_FIELDS: string; // Will be parsed as array in Observability
  
  // New Observability variables - OpenTelemetry
  OTEL_ENABLED: boolean;
  OTEL_SERVICE_NAME: string;
  OTEL_SERVICE_VERSION: string;
  OTEL_EXPORTER_OTLP_ENDPOINT: string;
  OTEL_EXPORTER_OTLP_HEADERS?: string;
  OTEL_ATTRIBUTE_VALUE_LENGTH_LIMIT?: number;
};

const defaults: Required<EnvSchema> = {
  // Existing defaults...
  

  // Keep existing defaults exactly as they were
  SERVER_SECRET: 'default-secret',
  DATABASE_URL: 'postgres://localhost:5432/mydb',
  VITE_PUBLIC_API_URL: 'http://localhost:3000/api',
  VITE_PUBLIC_ENV: 'development',
  VITE_DEBUG_MODE: false,
  VITE_LOCALE: 'en-US',
  TIMEZONE: 'America/Mexico_City',
  LOCALE: 'es-MX',
  KRATOS_BASE_URL: 'http://localhost:4433', // Make sure this matches your original value


  // Logging defaults
  LOG_LEVEL: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  LOG_TARGETS: process.env.NODE_ENV === 'production' ? 'file,opentelemetry' : 'console',
  LOG_FORMAT: process.env.NODE_ENV === 'production' ? 'json' : 'pretty',
  LOG_FILE_PATH: './logs',
  LOG_FILE_ROTATION: true,
  LOG_MAX_SIZE: 10 * 1024 * 1024, // 10MB
  LOG_INCLUDE_TIMESTAMP: true,
  LOG_INCLUDE_HOSTNAME: true,
  CORRELATION_ID_HEADER: 'X-Correlation-ID',
  REDACT_FIELDS: 'password,secret,token,authorization,cookie',
  
  // OpenTelemetry defaults
  OTEL_ENABLED: process.env.NODE_ENV === 'production',
  OTEL_SERVICE_NAME: 'omni-iam',
  OTEL_SERVICE_VERSION: '1.0.0',
  OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4317',
  OTEL_EXPORTER_OTLP_HEADERS: '',
  OTEL_ATTRIBUTE_VALUE_LENGTH_LIMIT: undefined,
};

// Generic validator function type
type GenericValidator = (value: any) => { valid: boolean; message?: string };

const validators: Record<keyof EnvSchema, GenericValidator> = {
  // Existing validators...
  
  // Logging validators
  LOG_LEVEL: (value: string) => ({
      valid: ['trace', 'debug', 'info', 'warn', 'error', 'fatal'].includes(value),
      message: 'Log level must be one of: trace, debug, info, warn, error, fatal'
  }),
  LOG_TARGETS: (value: string) => ({
      valid: value.split(',').every(t => ['console', 'file', 'opentelemetry'].includes(t.trim())),
      message: 'Log targets must be a comma-separated list of: console, file, opentelemetry'
  }),
  LOG_FORMAT: (value: string) => ({
      valid: ['json', 'pretty'].includes(value),
      message: 'Log format must be either json or pretty'
  }),
  LOG_FILE_PATH: (value: string) => ({
      valid: value.length > 0,
      message: 'Log file path must not be empty'
  }),
  LOG_FILE_ROTATION: (value: boolean) => ({
      valid: typeof value === 'boolean',
      message: 'Log file rotation must be a boolean'
  }),
  LOG_MAX_SIZE: (value: number) => ({
      valid: value > 0,
      message: 'Log max size must be greater than 0'
  }),
  LOG_INCLUDE_TIMESTAMP: (value: boolean) => ({
      valid: typeof value === 'boolean',
      message: 'Log include timestamp must be a boolean'
  }),
  LOG_INCLUDE_HOSTNAME: (value: boolean) => ({
      valid: typeof value === 'boolean',
      message: 'Log include hostname must be a boolean'
  }),
  CORRELATION_ID_HEADER: (value: string) => ({
      valid: value.length > 0,
      message: 'Correlation ID header must not be empty'
  }),
  REDACT_FIELDS: (value: string) => ({
      valid: value.length > 0,
      message: 'Redact fields must not be empty'
  }),
  
  // OpenTelemetry validators
  OTEL_ENABLED: (value: boolean) => ({
      valid: typeof value === 'boolean',
      message: 'OTEL enabled must be a boolean'
  }),
  OTEL_SERVICE_NAME: (value: string) => ({
      valid: value.length > 0,
      message: 'OTEL service name must not be empty'
  }),
  OTEL_SERVICE_VERSION: (value: string) => ({
      valid: value.length > 0,
      message: 'OTEL service version must not be empty'
  }),
  OTEL_EXPORTER_OTLP_ENDPOINT: (value: string) => ({
      valid: value.length > 0,
      message: 'OTEL exporter OTLP endpoint must not be empty'
  }),
  OTEL_EXPORTER_OTLP_HEADERS: (value?: string) => ({
      valid: true, // Optional
      message: ''
  }),
  OTEL_ATTRIBUTE_VALUE_LENGTH_LIMIT: (value?: number) => ({
      valid: value === undefined || value > 0,
      message: 'OTEL attribute value length limit must be greater than 0'
  }),
};

type Transformer<T> = {
  parse: (raw: string) => T;
  validate: GenericValidator;
};

const transformers: Partial<Record<keyof EnvSchema, Transformer<any>>> = {
  // Existing transformers...
  
  // Logging transformers
  LOG_LEVEL: {
      parse: (v) => v,
      validate: validators.LOG_LEVEL
  },
  LOG_TARGETS: {
      parse: (v) => v,
      validate: validators.LOG_TARGETS
  },
  LOG_FORMAT: {
      parse: (v) => v,
      validate: validators.LOG_FORMAT
  },
  LOG_FILE_ROTATION: {
      parse: (v) => v === 'true',
      validate: validators.LOG_FILE_ROTATION
  },
  LOG_MAX_SIZE: {
      parse: (v) => parseInt(v, 10),
      validate: validators.LOG_MAX_SIZE
  },
  LOG_INCLUDE_TIMESTAMP: {
      parse: (v) => v === 'true',
      validate: validators.LOG_INCLUDE_TIMESTAMP
  },
  LOG_INCLUDE_HOSTNAME: {
      parse: (v) => v === 'true',
      validate: validators.LOG_INCLUDE_HOSTNAME
  },
  
  // OpenTelemetry transformers
  OTEL_ENABLED: {
      parse: (v) => v === 'true',
      validate: validators.OTEL_ENABLED
  },
  OTEL_ATTRIBUTE_VALUE_LENGTH_LIMIT: {
      parse: (v) => v ? parseInt(v, 10) : undefined,
      validate: validators.OTEL_ATTRIBUTE_VALUE_LENGTH_LIMIT
  },
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