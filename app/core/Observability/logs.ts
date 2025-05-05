// app/core/Observability/logs.ts

import pino from 'pino';
import { DateTime } from 'luxon';
import { ViteEnv } from '../ViteEnv/index';

// Define log levels as a union type
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

// Define log targets as a union type
export type LogTarget = 'console' | 'file' | 'opentelemetry';

// Define log formats
export type LogFormat = 'json' | 'pretty';

// Define RedactOptions interface based on Pino's documentation
interface RedactOptions {
  paths: string[];
  remove?: boolean;
  censor?: string;
}

// Schema for log configuration with exact types
export interface LogSchema {
  // Log level configuration
  LOG_LEVEL: LogLevel;
  // Output targets
  LOG_TARGETS: LogTarget[];
  // File logging options
  LOG_FILE_PATH?: string;
  LOG_FILE_ROTATION?: boolean;
  LOG_MAX_SIZE?: number;
  // Format options
  LOG_FORMAT: LogFormat;
  // Context fields to include with every log
  LOG_INCLUDE_TIMESTAMP: boolean;
  LOG_INCLUDE_HOSTNAME: boolean;
  // Correlation ID configuration
  CORRELATION_ID_HEADER: string;
  // Redaction patterns (fields to never log)
  REDACT_FIELDS: string[];
}

// Default configuration with proper type
const defaultConfig: LogSchema = {
  LOG_LEVEL: (process.env.NODE_ENV === 'production' ? 'info' : 'debug') as LogLevel,
  LOG_TARGETS: (process.env.NODE_ENV === 'production' ? ['file', 'opentelemetry'] : ['console']) as LogTarget[],
  LOG_FILE_PATH: './logs',
  LOG_FILE_ROTATION: true,
  LOG_MAX_SIZE: 10 * 1024 * 1024, // 10MB
  LOG_FORMAT: (process.env.NODE_ENV === 'production' ? 'json' : 'pretty') as LogFormat,
  LOG_INCLUDE_TIMESTAMP: true,
  LOG_INCLUDE_HOSTNAME: true,
  CORRELATION_ID_HEADER: 'X-Correlation-ID',
  REDACT_FIELDS: ['password', 'secret', 'token', 'authorization', 'cookie']
};

// Type for the logger itself
export type LoggerInstance = pino.Logger;

// Type for logging context - more strictly defined
export interface LogContext {
  [key: string]: string | number | boolean | object | null | undefined;
}

// Transport target options type
interface TransportTargetOption extends pino.TransportTargetOptions {
  target: string;
  options: Record<string, any>;
}

class LogManager {
  private static instance: LogManager | null = null;
  private logger: LoggerInstance;
  private config: LogSchema;
  
  private constructor() {
    this.config = this.loadConfiguration();
    this.logger = this.createLogger();
  }
  
  private loadConfiguration(): LogSchema {
    // Start with default configuration
    const config: LogSchema = { ...defaultConfig };
    
    // Override with environment variables if available
    if (process.env.LOG_LEVEL) {
      const level = process.env.LOG_LEVEL;
      if (this.isValidLogLevel(level)) {
        config.LOG_LEVEL = level;
      }
    }
    
    if (process.env.LOG_TARGETS) {
      const targets = process.env.LOG_TARGETS.split(',')
        .map(t => t.trim())
        .filter(this.isValidLogTarget);
      
      if (targets.length > 0) {
        config.LOG_TARGETS = targets;
      }
    }
    
    if (process.env.LOG_FORMAT) {
      const format = process.env.LOG_FORMAT;
      if (this.isValidLogFormat(format)) {
        config.LOG_FORMAT = format;
      }
    }
    
    if (process.env.LOG_FILE_PATH) {
      config.LOG_FILE_PATH = process.env.LOG_FILE_PATH;
    }
    
    if (process.env.REDACT_FIELDS) {
      config.REDACT_FIELDS = process.env.REDACT_FIELDS.split(',').map(f => f.trim());
    }
    
    // Parse boolean options
    if (process.env.LOG_INCLUDE_TIMESTAMP !== undefined) {
      config.LOG_INCLUDE_TIMESTAMP = process.env.LOG_INCLUDE_TIMESTAMP === 'true';
    }
    
    if (process.env.LOG_INCLUDE_HOSTNAME !== undefined) {
      config.LOG_INCLUDE_HOSTNAME = process.env.LOG_INCLUDE_HOSTNAME === 'true';
    }
    
    return config;
  }
  
  // Type guard for log level
  private isValidLogLevel(level: string): level is LogLevel {
    return ['trace', 'debug', 'info', 'warn', 'error', 'fatal'].includes(level);
  }
  
  // Type guard for log target
  private isValidLogTarget(target: string): target is LogTarget {
    return ['console', 'file', 'opentelemetry'].includes(target);
  }
  
  // Type guard for log format
  private isValidLogFormat(format: string): format is LogFormat {
    return ['json', 'pretty'].includes(format);
  }
  
  // app/core/Observability/logs.ts (partial update for createLogger method)

private createLogger(): LoggerInstance {
    // Configure transports based on targets
    const transports: TransportTargetOption[] = [];
    
    // Setup redaction patterns
    const redactOptions: RedactOptions = {
      paths: this.config.REDACT_FIELDS,
      censor: '[REDACTED]'
    };
    
    // Base logger options without formatters when using transports
    const loggerOptions: pino.LoggerOptions = {
      level: this.config.LOG_LEVEL,
      redact: redactOptions
    };
    
    // Add timestamp handling
    if (this.config.LOG_INCLUDE_TIMESTAMP) {
      loggerOptions.timestamp = () => `,"time":"${DateTime.now().setZone(ViteEnv.TIMEZONE).toISO()}"`;
    }
    
    // Configure transports
    if (this.config.LOG_TARGETS.includes('console')) {
      if (this.config.LOG_FORMAT === 'pretty') {
        transports.push({
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: true,
            ignore: 'pid,hostname'
          }
        });
      } else {
        // Use standard console output for JSON format
        transports.push({
          target: 'pino/file',
          options: { destination: 1 } // stdout
        });
      }
    }
    
    if (this.config.LOG_TARGETS.includes('file')) {
      transports.push({
        target: 'pino/file',
        options: {
          destination: `${this.config.LOG_FILE_PATH}/app.log`,
          mkdir: true
        }
      });
    }
    
    if (this.config.LOG_TARGETS.includes('opentelemetry')) {
      transports.push({
        target: 'pino-opentelemetry-transport',
        options: {
          serviceName: 'omni-iam',
          serviceVersion: '1.0.0'
        }
      });
    }
    
    // Create and return the logger
    if (transports.length > 0) {
      // When using transports, don't use formatters
      return pino({
        ...loggerOptions,
        transport: {
          targets: transports
        }
      });
    } else {
      // When not using transports, we can use formatters
      return pino({
        ...loggerOptions,
        formatters: {
          level: (label: string) => {
            return { level: label };
          },
          bindings: (bindings: pino.Bindings) => {
            return this.config.LOG_INCLUDE_HOSTNAME
              ? bindings
              : { pid: bindings.pid };
          }
        }
      });
    }
  }
  
  public static getInstance(): LogManager {
    if (!LogManager.instance) {
      LogManager.instance = new LogManager();
    }
    return LogManager.instance;
  }
  
  public getLogger(): LoggerInstance {
    return this.logger;
  }
  
  public createChildLogger(context: LogContext): LoggerInstance {
    return this.logger.child(context);
  }
  
  public getConfig(): LogSchema {
    return { ...this.config };
  }
  
  public setConfig(config: Partial<LogSchema>): void {
    this.config = { ...this.config, ...config };
    this.logger = this.createLogger();
  }
  
  // Helper to create context-specific loggers
  public static createContextLogger(context: LogContext = {}): LoggerInstance {
    return LogManager.getInstance().createChildLogger(context);
  }

  // For testing and debugging
  public static resetLogger(): void {
    LogManager.instance = new LogManager();
  }
}

// Export the singleton logger instance
export const logger = LogManager.getInstance().getLogger();

// Export helper functions for creating context loggers
export const createContextLogger = LogManager.createContextLogger;

// Export the manager itself for advanced usage
export const logManager = LogManager.getInstance();