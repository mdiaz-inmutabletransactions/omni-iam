// app/core/Observability/logs.ts - update to use ViteEnv

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

// Type for the logger itself
export type LoggerInstance = pino.Logger;

// Type for logging context - more strictly defined
export interface LogContext {
  [key: string]: string | number | boolean | object | null | undefined;
}

// Transport target options type
interface TransportTargetOption {
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
    // Parse LOG_TARGETS from string to array
    const logTargets = ViteEnv.LOG_TARGETS.split(',')
      .map(t => t.trim())
      .filter(this.isValidLogTarget) as LogTarget[];
    
    // Parse REDACT_FIELDS from string to array
    const redactFields = ViteEnv.REDACT_FIELDS.split(',')
      .map(f => f.trim());
    
    // Create config from ViteEnv values
    return {
      LOG_LEVEL: this.isValidLogLevel(ViteEnv.LOG_LEVEL) ? ViteEnv.LOG_LEVEL : 'info',
      LOG_TARGETS: logTargets.length > 0 ? logTargets : ['console'],
      LOG_FORMAT: this.isValidLogFormat(ViteEnv.LOG_FORMAT) ? ViteEnv.LOG_FORMAT : 'json',
      LOG_FILE_PATH: ViteEnv.LOG_FILE_PATH,
      LOG_FILE_ROTATION: ViteEnv.LOG_FILE_ROTATION,
      LOG_MAX_SIZE: ViteEnv.LOG_MAX_SIZE,
      LOG_INCLUDE_TIMESTAMP: ViteEnv.LOG_INCLUDE_TIMESTAMP,
      LOG_INCLUDE_HOSTNAME: ViteEnv.LOG_INCLUDE_HOSTNAME,
      CORRELATION_ID_HEADER: ViteEnv.CORRELATION_ID_HEADER,
      REDACT_FIELDS: redactFields
    };
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
  
  private createLogger(): LoggerInstance {
    // Setup redaction patterns
    const redactOptions: RedactOptions = {
      paths: this.config.REDACT_FIELDS,
      censor: '[REDACTED]'
    };
    
    // Base logger options
    const baseOptions: pino.LoggerOptions = {
      level: this.config.LOG_LEVEL,
      redact: redactOptions
    };
    
    // Add timestamp if configured
    if (this.config.LOG_INCLUDE_TIMESTAMP) {
      baseOptions.timestamp = () => `,"time":"${DateTime.now().setZone(ViteEnv.TIMEZONE).toISO()}"`;
    }
    
    // If using transports, we need to avoid using formatters
    if (this.config.LOG_TARGETS.length > 0 && 
       (this.config.LOG_TARGETS.includes('file') || 
        this.config.LOG_TARGETS.includes('opentelemetry') || 
        (this.config.LOG_TARGETS.includes('console') && this.config.LOG_FORMAT === 'pretty'))) {
      
      const targets: TransportTargetOption[] = [];
      
      // Configure transports based on targets
      if (this.config.LOG_TARGETS.includes('console')) {
        if (this.config.LOG_FORMAT === 'pretty') {
          targets.push({
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: true,
              ignore: 'pid,hostname'
            }
          });
        } else {
          targets.push({
            target: 'pino/file',
            options: { destination: 1 } // stdout
          });
        }
      }
      
      if (this.config.LOG_TARGETS.includes('file')) {
        targets.push({
          target: 'pino/file',
          options: {
            destination: `${this.config.LOG_FILE_PATH}/app.log`,
            mkdir: true
          }
        });
      }
      
      if (this.config.LOG_TARGETS.includes('opentelemetry')) {
        targets.push({
          target: 'pino-opentelemetry-transport',
          options: {
            serviceName: ViteEnv.OTEL_SERVICE_NAME,
            serviceVersion: ViteEnv.OTEL_SERVICE_VERSION
          }
        });
      }
      
      // Create logger with transports but without formatters
      return pino({
        ...baseOptions,
        transport: {
          targets
        }
      });
    } else {
      // No transports, or only console with json format
      // We can use formatters in this case
      return pino({
        ...baseOptions,
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