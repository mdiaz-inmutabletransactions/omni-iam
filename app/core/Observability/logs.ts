// app/core/Observability/logs.ts

// Detect if we're in a Node.js environment
const isNodeEnvironment = typeof process !== 'undefined' && 
                          process.versions != null && 
                          process.versions.node != null;

// Only import Node.js specific modules if we're in a Node.js environment
let pino: any;
let DateTime: any;

// Try to import Node.js modules only in Node.js environment
if (isNodeEnvironment) {
  try {
    pino = require('pino');
    const { DateTime: LuxonDateTime } = require('luxon');
    DateTime = LuxonDateTime;
  } catch (error) {
    console.warn('Failed to import pino or luxon:', error);
  }
}

// Import from the config module
import { 
  getEnv, 
  getBoolEnv,
  getNumEnv, 
  logDefaults,
  safeLog
} from '../config/enviroment';

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

// Type for the logger itself - use any to make it compatible in both environments
export type LoggerInstance = any;

// Type for logging context - more strictly defined
export interface LogContext {
  [key: string]: string | number | boolean | object | null | undefined;
}

// Transport target options type
interface TransportTargetOption {
  target: string;
  options: Record<string, any>;
}

// Simple console logger for browser environments
const createConsoleLogger = () => {
  return {
    trace: (data: any) => console.trace(data),
    debug: (data: any) => console.debug(data),
    info: (data: any) => console.info(data),
    warn: (data: any) => console.warn(data),
    error: (data: any) => console.error(data),
    fatal: (data: any) => console.error(data),
    child: (context: LogContext) => createConsoleLogger() // Return a new instance for child loggers
  };
};

class LogManager {
  private static instance: LogManager | null = null;
  private logger: LoggerInstance;
  private config: LogSchema;
  
  private constructor() {
    this.config = this.loadConfiguration();
    this.logger = this.createLogger();
  }
  
  private loadConfiguration(): LogSchema {
    // Use the environment config module instead of ViteEnv
    
    // Parse LOG_TARGETS from string to array
    const logTargetsStr = getEnv('LOG_TARGETS', logDefaults.LOG_TARGETS);
    
    // Safely parse and filter log targets
    let logTargets: LogTarget[] = ['console']; // Default to console if parsing fails
    
    if (logTargetsStr) {
      // Parse and filter to valid targets only
      const parsedTargets = logTargetsStr.split(',')
        .map((t: string) => t.trim())
        .filter((t: string) => this.isValidLogTarget(t)) as LogTarget[];
      
      if (parsedTargets.length > 0) {
        logTargets = parsedTargets;
      }
    }
    
    // Parse REDACT_FIELDS from string to array
    const redactFieldsStr = getEnv('REDACT_FIELDS', logDefaults.REDACT_FIELDS);
    const redactFields = redactFieldsStr
      ? redactFieldsStr.split(',').map((f: string) => f.trim())
      : ['password', 'secret', 'token', 'authorization', 'cookie'];
    
    // Create config from environment values with defaults
    const logLevelStr = getEnv('LOG_LEVEL', logDefaults.LOG_LEVEL);
    
    return {
      LOG_LEVEL: this.isValidLogLevel(logLevelStr) ? logLevelStr as LogLevel : 'info',
      LOG_TARGETS: logTargets,
      LOG_FORMAT: this.isValidLogFormat(getEnv('LOG_FORMAT', logDefaults.LOG_FORMAT)) 
        ? getEnv('LOG_FORMAT', logDefaults.LOG_FORMAT) as LogFormat 
        : 'json',
      LOG_FILE_PATH: getEnv('LOG_FILE_PATH', logDefaults.LOG_FILE_PATH),
      LOG_FILE_ROTATION: getBoolEnv('LOG_FILE_ROTATION', true),
      LOG_MAX_SIZE: getNumEnv('LOG_MAX_SIZE', 10 * 1024 * 1024),
      LOG_INCLUDE_TIMESTAMP: getBoolEnv('LOG_INCLUDE_TIMESTAMP', true),
      LOG_INCLUDE_HOSTNAME: getBoolEnv('LOG_INCLUDE_HOSTNAME', true),
      CORRELATION_ID_HEADER: getEnv('CORRELATION_ID_HEADER', logDefaults.CORRELATION_ID_HEADER) || 'X-Correlation-ID',
      REDACT_FIELDS: redactFields
    };
  }
  
  // Type guard for log level
  private isValidLogLevel(level: string | undefined): level is LogLevel {
    return !!level && ['trace', 'debug', 'info', 'warn', 'error', 'fatal'].includes(level);
  }
  
  // Type guard for log target
  private isValidLogTarget(target: string): target is LogTarget {
    return ['console', 'file', 'opentelemetry'].includes(target);
  }
  
  // Type guard for log format
  private isValidLogFormat(format: string | undefined): format is LogFormat {
    return !!format && ['json', 'pretty'].includes(format);
  }
  
  private createLogger(): LoggerInstance {
    // If we're in a browser or pino isn't available, return a simple console logger
    if (!isNodeEnvironment || !pino) {
      safeLog('info', {
        message: "Using console logger for browser environment",
        environment: "browser"
      });
      return createConsoleLogger();
    }
    
    // From here, we know we're in a Node.js environment with pino available
    
    // Setup redaction patterns
    const redactOptions: RedactOptions = {
      paths: this.config.REDACT_FIELDS,
      censor: '[REDACTED]'
    };
    
    // Custom timestamp function to ensure ISO format with timezone
    function timestampFunction() {
      const timezone = getEnv('TIMEZONE', 'UTC');
      const now = DateTime ? DateTime.now().setZone(timezone) : new Date();
      return `,"time":"${now.toISOString()}"`;
    }
    
    // Base logger options
    const baseOptions: any = {
      level: this.config.LOG_LEVEL,
      redact: redactOptions,
      timestamp: timestampFunction,
    };
    
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
        const serviceName = getEnv('OTEL_SERVICE_NAME', 'omni-iam');
        const serviceVersion = getEnv('OTEL_SERVICE_VERSION', '1.0.0');
        
        targets.push({
          target: 'pino-opentelemetry-transport',
          options: {
            serviceName,
            serviceVersion
          }
        });
      }
      
      try {
        // Create logger with transport - fixed type issue
        // Use the transport property in the options object, not as a second parameter
        return pino({
          ...baseOptions,
          transport: {
            targets
          }
        });
      } catch (error) {
        safeLog('error', {
          message: "Failed to create pino logger with transports",
          error: error instanceof Error ? error.message : String(error)
        });
        // Fallback to console logger
        return createConsoleLogger();
      }
    } else {
      // No transports, or only console with json format
      // We can use formatters in this case
      try {
        return pino({
          ...baseOptions,
          formatters: {
            level: (label: string) => {
              return { level: label };
            },
            bindings: (bindings: any) => {
              return this.config.LOG_INCLUDE_HOSTNAME
                ? bindings
                : { pid: bindings.pid };
            }
          }
        });
      } catch (error) {
        safeLog('error', {
          message: "Failed to create pino logger with formatters",
          error: error instanceof Error ? error.message : String(error)
        });
        // Fallback to console logger
        return createConsoleLogger();
      }
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
  
  // Create a child logger without custom serializers
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

// Define extensions to make logging more consistent
export const logInfo = (data: Record<string, any>): void => {
  logger.info(data);
};

export const logDebug = (data: Record<string, any>): void => {
  logger.debug(data);
};

export const logWarn = (data: Record<string, any>): void => {
  logger.warn(data);
};

export const logError = (data: Record<string, any>): void => {
  logger.error(data);
};