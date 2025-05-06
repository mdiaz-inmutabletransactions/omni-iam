// app/core/ViteEnv/index.ts
/// <reference path="./types/env.d.ts" />

// Import from the shared config module
import { 
  getEnv, 
  getBoolEnv, 
  getNumEnv, 
  logDefaults,
  otelDefaults,
  safeLog 
} from '../config/enviroment';

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
    
    // Logging configuration
    LOG_LEVEL: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
    LOG_TARGETS: string; // Comma-separated list: 'console,file,opentelemetry'
    LOG_FORMAT: 'json' | 'pretty';
    LOG_FILE_PATH: string;
    LOG_FILE_ROTATION: boolean;
    LOG_MAX_SIZE: number;
    LOG_INCLUDE_TIMESTAMP: boolean;
    LOG_INCLUDE_HOSTNAME: boolean;
    CORRELATION_ID_HEADER: string;
    REDACT_FIELDS: string; // Comma-separated list of fields to redact
    
    // OpenTelemetry configuration
    OTEL_ENABLED: boolean;
    OTEL_SERVICE_NAME: string;
    OTEL_SERVICE_VERSION: string;
    OTEL_EXPORTER_OTLP_ENDPOINT: string;
    OTEL_EXPORTER_OTLP_HEADERS?: string;
    OTEL_ATTRIBUTE_VALUE_LENGTH_LIMIT?: number;
};

// Default values for all environment variables
const defaults: Required<EnvSchema> = {
  SERVER_SECRET: 'default-secret',
  DATABASE_URL: 'postgres://localhost:5432/mydb',
  VITE_PUBLIC_API_URL: 'http://localhost:3000/api',
  VITE_PUBLIC_ENV: 'development',
  VITE_DEBUG_MODE: false,
  VITE_LOCALE: 'en-US',
  TIMEZONE: 'America/Mexico_City',
  LOCALE: 'es-MX',
  KRATOS_BASE_URL: 'http://localhost:4433',
  
  // Logging defaults from shared config module
  LOG_LEVEL: logDefaults.LOG_LEVEL as 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal',
  LOG_TARGETS: logDefaults.LOG_TARGETS,
  LOG_FORMAT: logDefaults.LOG_FORMAT as 'json' | 'pretty',
  LOG_FILE_PATH: logDefaults.LOG_FILE_PATH,
  LOG_FILE_ROTATION: true,
  LOG_MAX_SIZE: 10 * 1024 * 1024, // 10MB
  LOG_INCLUDE_TIMESTAMP: true,
  LOG_INCLUDE_HOSTNAME: true,
  CORRELATION_ID_HEADER: logDefaults.CORRELATION_ID_HEADER,
  REDACT_FIELDS: logDefaults.REDACT_FIELDS,
  
  // OpenTelemetry defaults from shared config module
  OTEL_ENABLED: otelDefaults.OTEL_ENABLED === 'true',
  OTEL_SERVICE_NAME: otelDefaults.OTEL_SERVICE_NAME,
  OTEL_SERVICE_VERSION: otelDefaults.OTEL_SERVICE_VERSION,
  OTEL_EXPORTER_OTLP_ENDPOINT: otelDefaults.OTEL_EXPORTER_OTLP_ENDPOINT,
  OTEL_EXPORTER_OTLP_HEADERS: '',
  OTEL_ATTRIBUTE_VALUE_LENGTH_LIMIT: 8192,
};

// Generic validator function type
type GenericValidator = (value: any) => { valid: boolean; message?: string };

// Validators for each environment variable
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
  }),
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
  OTEL_EXPORTER_OTLP_HEADERS: (value: string) => ({
    valid: true, // Allow any value including empty string
    message: ''
  }),
  OTEL_ATTRIBUTE_VALUE_LENGTH_LIMIT: (value?: number) => ({
    valid: value === undefined || value > 0,
    message: 'OTEL attribute value length limit must be greater than 0'
  }),
};

// Type transformer definition
type Transformer<T> = {
  parse: (raw: string) => T;
  validate: GenericValidator;
};

// Transformers for environment variables
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
  },
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
  OTEL_ENABLED: {
    parse: (v) => v === 'true',
    validate: validators.OTEL_ENABLED
  },
  OTEL_ATTRIBUTE_VALUE_LENGTH_LIMIT: {
    parse: (v: string) => v ? parseInt(v, 10) : 8192, // Always return a number
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

      // Debug log to help troubleshoot with structured format
      safeLog('debug', {
        message: "Loading environment variable",
        key,
        status: rawValue !== undefined ? 'defined' : 'undefined'
      });
      
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
            safeLog('warn', {
              message: "Invalid environment variable",
              key,
              validation_message: validation.message
            });
          }
        } catch (error) {
          safeLog('warn', {
            message: "Failed to parse environment variable",
            key,
            error: error instanceof Error ? error.message : String(error)
          });
          
          safeLog('warn', {
            message: "Falling back to default value",
            key,
            defaultValue: key.includes('SECRET') ? '[REDACTED]' : defaults[key]
          });
          
          envMap.set(key, { 
            value: defaults[key], 
            source: 'default',
            valid: true
          });
        }
      } else {
        safeLog('debug', {
          message: "Using default value for environment variable",
          key,
          defaultValue: key.includes('SECRET') ? '[REDACTED]' : defaults[key]
        });
        
        envMap.set(key, { 
          value: defaults[key], 
          source: 'default',
          valid: true
        });
      }
    });

    // Log summary with structured format
    safeLog('info', {
      message: "Environment variables loaded",
      totalVars: envMap.size,
      fromEnv: Array.from(envMap.values()).filter(v => v.source === 'env').length,
      fromDefault: Array.from(envMap.values()).filter(v => v.source === 'default').length,
      invalidVars: Array.from(envMap.values()).filter(v => !v.valid).length
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
      safeLog('warn', {
        message: "Validation failed when setting environment variable",
        key,
        value: key.includes('SECRET') ? '[REDACTED]' : value,
        validation_message: validation.message
      });
      
      return { success: false, message: validation.message };
    }

    ViteEnvManager.instance.env.set(key, { 
      value, 
      source: 'manual',
      valid: true
    });
    
    // Log the change with structured format
    safeLog('info', {
      message: "Environment variable updated manually",
      key,
      previousSource: ViteEnvManager.instance.env.get(key)?.source,
      newSource: 'manual'
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

    // Log validation results with structured format
    if (!valid) {
      safeLog('warn', {
        message: "Environment validation failed",
        errorCount: Object.keys(errors).length,
        errors
      });
    } else {
      safeLog('info', {
        message: "Environment validation succeeded",
        validVars: ViteEnvManager.instance.env.size
      });
    }

    return { valid, errors };
  }

  // Updated debug method with structured logging
  public static debug(): Record<string, { value: any; source: EnvSource; valid: boolean }> {
    if (!ViteEnvManager.instance) {
      ViteEnvManager.instance = new ViteEnvManager();
    }
    
    const debugInfo = Object.fromEntries(
      Array.from(ViteEnvManager.instance.env.entries())
        .map(([key, value]) => [key, { 
          value: key.includes('SECRET') || key.includes('PASSWORD') || key.includes('TOKEN') ? 
                 '[REDACTED]' : value.value, 
          source: value.source,
          valid: value.valid 
        }])
    );
    
    // Generate summary information
    const summary = {
      total: Object.keys(debugInfo).length,
      fromEnv: Object.values(debugInfo).filter(v => v.source === 'env').length,
      fromDefault: Object.values(debugInfo).filter(v => v.source === 'default').length,
      fromManual: Object.values(debugInfo).filter(v => v.source === 'manual').length,
      valid: Object.values(debugInfo).filter(v => v.valid).length,
      invalid: Object.values(debugInfo).filter(v => !v.valid).length
    };
    
    // Log debug summary with structured format
    safeLog('info', {
      message: "Environment variables debug information",
      summary
    });
    
    // Log problematic variables if any
    const invalidVars = Object.entries(debugInfo)
      .filter(([_, info]) => !info.valid)
      .map(([key]) => key);
      
    if (invalidVars.length > 0) {
      safeLog('warn', {
        message: "Invalid environment variables detected",
        count: invalidVars.length,
        variables: invalidVars
      });
    }
    
    // Log variables with default values in production (potential issue)
    if (process.env.NODE_ENV === 'production') {
      const defaultVarsInProduction = Object.entries(debugInfo)
        .filter(([key, info]) => 
          info.source === 'default' && 
          !key.includes('TEST_') && 
          !key.startsWith('VITE_DEBUG')
        )
        .map(([key]) => key);
        
      if (defaultVarsInProduction.length > 0) {
        safeLog('warn', {
          message: "Production environment using default values",
          count: defaultVarsInProduction.length,
          variables: defaultVarsInProduction
        });
      }
    }
    
    return debugInfo;
  }
}

export const ViteEnv = ViteEnvManager.get();
export const validatedEnv = ViteEnvManager.getWithValidation;
export const setEnv = ViteEnvManager.set;
export const validateEnv = ViteEnvManager.validateAll;
export const debugEnv = ViteEnvManager.debug;