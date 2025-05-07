// app/core/Observability/logs.ts

// Detect if we're in a Node.js environment
const isNodeEnvironment = typeof process !== 'undefined' && 
                          process.versions != null && 
                          process.versions.node != null;

import { pino, LoggerOptions, TransportTargetOptions } from 'pino';

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

// Define RedactOptions interface
interface RedactOptions {
  paths: string[];
  remove?: boolean;
  censor?: string;
}

// Schema for log configuration with exact types
export interface LogSchema {
  LOG_LEVEL: LogLevel;
  LOG_TARGETS: LogTarget[];
  LOG_FILE_PATH?: string;
  LOG_FILE_ROTATION?: boolean;
  LOG_MAX_SIZE?: number;
  LOG_FORMAT: LogFormat;
  LOG_INCLUDE_TIMESTAMP: boolean;
  LOG_INCLUDE_HOSTNAME: boolean;
  CORRELATION_ID_HEADER: string;
  REDACT_FIELDS: string[];
}

// Define a proper interface for the logger that includes all possible methods
export interface LoggerInstance {
  trace: (data: any) => void;
  debug: (data: any) => void;
  info: (data: any) => void;
  warn: (data: any) => void;
  error: (data: any) => void;
  fatal: (data: any) => void;
  child: (context: LogContext) => LoggerInstance;
  flush?: () => void; // Optional because it may not exist on console logger
  [key: string]: any; // Allow any other properties
}

// Type for logging context
export interface LogContext {
  [key: string]: string | number | boolean | object | null | undefined;
}

// Simple console logger for browser environments or before Pino is loaded
function createConsoleLogger(): LoggerInstance {
  return {
    trace: (data: any) => { console.trace(data); return true; },
    debug: (data: any) => { console.debug(data); return true; },
    info: (data: any) => { console.info(data); return true; },
    warn: (data: any) => { console.warn(data); return true; },
    error: (data: any) => { console.error(data); return true; },
    fatal: (data: any) => { console.error(data); return true; },
    child: (context: LogContext) => createConsoleLogger(),
    flush: () => {}
  };
}

// Get configuration
const logLevel = getEnv('LOG_LEVEL', logDefaults.LOG_LEVEL) || 'info';
const logTargetsStr = getEnv('LOG_TARGETS', logDefaults.LOG_TARGETS);
const logTargets = logTargetsStr ? logTargetsStr.split(',').map(t => t.trim()) : ['console'];
const logFilePath = getEnv('LOG_FILE_PATH', logDefaults.LOG_FILE_PATH) || './logs';
const logFormat = getEnv('LOG_FORMAT', logDefaults.LOG_FORMAT) || 'json';

console.log(`Initializing logger with targets: ${logTargets.join(', ')}, format: ${logFormat}, path: ${logFilePath}`);

// Create a global logger instance that we'll export
// Start with a console logger that will be available immediately
const logger: LoggerInstance = createConsoleLogger();

// We need to set up file logging if necessary
if (isNodeEnvironment && logTargets.includes('file')) {
  // When in Node.js and file logging is requested, set it up immediately
  try {
  
    
// Call the function to get the transport configuration
const transportConfig = createPinoConfig(logTargets, logLevel, logFilePath);



    // Create destination - use sync mode to ensure immediate writing
   /* const destination = pino.destination({
      dest: logFilePath,
      sync: true, // Use synchronous mode for immediate disk writes
      mkdir: true
    });*/

   /* const transport = pino.transport({

      targets: [
        {
          target: 'pino/file',
          level: logLevel,
          options: {
            destination: logFilePath,
            mkdir: true,
            sync: true,
          }

        },
        {
          target: 'pino-pretty',
          level: logLevel,
          options: {
            colorize: true,
            ignore: 'pid,hostname',
          }

        }
      ]
    });*/


    // Create file logger
    const Logger = pino(transportConfig);

      // Update the global logger methods to log to both destinations
      const originalTrace = logger.trace;
      const originalDebug = logger.debug;
      const originalInfo = logger.info;
      const originalWarn = logger.warn;
      const originalError = logger.error;
      const originalFatal = logger.fatal;

      // Override methods to log to both
      logger.trace = (data: any) => {
        //consoleLogger.trace(data);
        Logger.trace(data);
        // Call original to maintain console logging during transition
        originalTrace(data);
        return true;
      };

      logger.debug = (data: any) => {
        ////consoleLogger.debug(data);
        Logger.debug(data);
        originalDebug(data);
        return true;
      };

      logger.info = (data: any) => {
        //consoleLogger.info(data);
        Logger.info(data);
        originalInfo(data);
        return true;
      };

      logger.warn = (data: any) => {
        //consoleLogger.warn(data);
        Logger.warn(data);
        originalWarn(data);
        return true;
      };

      logger.error = (data: any) => {
        //consoleLogger.error(data);
        Logger.error(data);
        originalError(data);
        return true;
      };

      logger.fatal = (data: any) => {
        //consoleLogger.fatal(data);
        Logger.fatal(data);
        originalFatal(data);
        return true;
      };

      // Custom child logger factory
      logger.child = (context: LogContext) => {
      
        return {
          trace: (data: any) => {logger.trace(data); return true; },
          debug: (data: any) => { logger.debug(data); return true; },
          info: (data: any) => { logger.info(data); return true; },
          warn: (data: any) => {logger.warn(data); return true; },
          error: (data: any) => {logger.error(data); return true; },
          fatal: (data: any) => { logger.fatal(data); return true; },
          child: (nestedContext: LogContext) => {
            const combinedContext = { ...context, ...nestedContext };
            return logger.child(combinedContext);
          },
          flush: () => {
            logger.flush;
          }
        };
      };

      // Add a flush method to ensure logs are written
      logger.flush = () => {
        if (Logger.flush) Logger.flush();
      };

      console.log('Dual logging configured successfully');
    /*} else {
      // File-only logging
      // Override the global logger methods with the file logger methods
      logger.trace = (data: any) => { Logger.trace(data); return true; };
      logger.debug = (data: any) => { Logger.debug(data); return true; };
      logger.info = (data: any) => { Logger.info(data); return true; };
      logger.warn = (data: any) => { Logger.warn(data); return true; };
      logger.error = (data: any) => { Logger.error(data); return true; };
      logger.fatal = (data: any) => { Logger.fatal(data); return true; };
      logger.child = (context: LogContext) => Logger.child(context);
      logger.flush = () => {
        if (Logger.flush) Logger.flush();
      };

      console.log('File-only logging configured successfully');
    }*/

    // Ensure logs are flushed on exit
    process.on('beforeExit', () => {
      if (Logger.flush) Logger.flush();
    });

    // Test log to verify file logging is working
    Logger.info('File logging initialized successfully');
    Logger.flush();



  } catch (error) {
    console.error('Error during logger initialization:', error);
  }
}


// Export the logger
export { logger };

// Export helper functions for creating loggers
export function createContextLogger(context: LogContext = {}): LoggerInstance {
  if (logger.child) {
    return logger.child(context);
  }
  return logger;
}

export function createComponentLogger(
  componentName: string, 
  additionalContext: LogContext = {}
): LoggerInstance {
  return createContextLogger({
    component: componentName,
    ...additionalContext
  });
}

export function createOperationLogger(
  operationName: string,
  requestId: string = crypto.randomUUID(),
  additionalContext: LogContext = {}
): LoggerInstance {
  return createContextLogger({
    operation: operationName,
    requestId,
    'event.name': operationName,
    ...additionalContext
  });
}

export function createRequestLogger(
  request: Request,
  additionalContext: LogContext = {}
): LoggerInstance {
  const url = new URL(request.url);
  const requestId = request.headers.get('X-Request-ID') || crypto.randomUUID();
  
  return createContextLogger({
    requestId,
    method: request.method,
    path: url.pathname,
    'http.method': request.method,
    'http.url': url.toString(),
    'http.request_id': requestId,
    ...additionalContext
  });
}

// LogManager class
export class LogManager {
  private static instance: LogManager | null = null;
  private config: LogSchema;
  
  private constructor() {
    this.config = this.loadConfiguration();
  }
  
  private loadConfiguration(): LogSchema {
    // Properly filter and cast to LogTarget[]
    const logTargets = logTargetsStr 
      ? (logTargetsStr.split(',')
          .map(t => t.trim())
          .filter(t => ['console', 'file', 'opentelemetry'].includes(t)) as LogTarget[])
      : ['console' as LogTarget];
      
    const redactFieldsStr = getEnv('REDACT_FIELDS', logDefaults.REDACT_FIELDS);
    const redactFields = redactFieldsStr
      ? redactFieldsStr.split(',').map((f: string) => f.trim())
      : ['password', 'secret', 'token', 'authorization', 'cookie'];
    
    return {
      LOG_LEVEL: this.isValidLogLevel(logLevel) ? logLevel as LogLevel : 'info',
      LOG_TARGETS: logTargets,
      LOG_FILE_PATH: getEnv('LOG_FILE_PATH', logDefaults.LOG_FILE_PATH),
      LOG_FORMAT: this.isValidLogFormat(logFormat) ? logFormat as LogFormat : 'json',
      LOG_FILE_ROTATION: getBoolEnv('LOG_FILE_ROTATION', true),
      LOG_MAX_SIZE: getNumEnv('LOG_MAX_SIZE', 10 * 1024 * 1024),
      LOG_INCLUDE_TIMESTAMP: getBoolEnv('LOG_INCLUDE_TIMESTAMP', true),
      LOG_INCLUDE_HOSTNAME: getBoolEnv('LOG_INCLUDE_HOSTNAME', true),
      CORRELATION_ID_HEADER: getEnv('CORRELATION_ID_HEADER', logDefaults.CORRELATION_ID_HEADER) || 'X-Correlation-ID',
      REDACT_FIELDS: redactFields
    };
  }
  
  // Type guard for log level
  private isValidLogLevel(level: string): level is LogLevel {
    return ['trace', 'debug', 'info', 'warn', 'error', 'fatal'].includes(level);
  }
  
  // Type guard for log format
  private isValidLogFormat(format: string): format is LogFormat {
    return ['json', 'pretty'].includes(format);
  }
  
  public static getInstance(): LogManager {
    if (!LogManager.instance) {
      LogManager.instance = new LogManager();
    }
    return LogManager.instance;
  }
  
  public getLogger(): LoggerInstance {
    return logger;
  }
  
  public getConfig(): LogSchema {
    return { ...this.config };
  }
}

// Export a singleton instance of the LogManager
export const logManager = LogManager.getInstance();

// Utility functions
export function redactSensitiveInfo(
  obj: unknown, 
  sensitiveFields: string[] = ['password', 'token', 'secret', 'authorization']
): unknown {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => redactSensitiveInfo(item, sensitiveFields));
  }
  
  const result: Record<string, unknown> = { ...obj as Record<string, unknown> };
  
  for (const key in result) {
    if (Object.prototype.hasOwnProperty.call(result, key)) {
      if (sensitiveFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
        result[key] = '[REDACTED]';
      } else if (typeof result[key] === 'object' && result[key] !== null) {
        result[key] = redactSensitiveInfo(result[key], sensitiveFields);
      }
    }
  }
  
  return result;
}

export function safeStringify(obj: unknown): string {
  try {
    return JSON.stringify(obj);
  } catch (error) {
    return String(obj);
  }
}

export function formatObject(
  obj: unknown, 
  options: {
    depth?: number;
    colors?: boolean;
    maxArrayLength?: number;
    breakLength?: number;
    compact?: boolean;
    sorted?: boolean;
  } = {}
): string {
  const defaults = {
    depth: 4,
    colors: isNodeEnvironment && process.env.NODE_ENV !== 'production',
    maxArrayLength: 100,
    breakLength: 80,
    compact: false,
    sorted: true
  };
  
  const config = { ...defaults, ...options };
  
  try {
    return JSON.stringify(obj, null, 2);
  } catch (error) {
    return String(obj);
  }
}

/**
 * Creates a Pino logger configuration based on log targets
 * @param logTargets Array of log targets (e.g. ['console', 'file'])
 * @param logLevel Log level (default: 'info')
 * @param logFilePath Path for log files (default: './logs')
 * @returns Pino LoggerOptions configuration
 */
export function createPinoConfig(
  logTargets: string[],
  logLevel: string = 'info',
  logFilePath: string = './logs'
): LoggerOptions<never, boolean> {
  // Map log targets to transport targets
  const targets: TransportTargetOptions[] = [];

  // Process each log target
  logTargets.forEach(target => {
    const trimmedTarget = target.trim();

    // Configure console transport
    if (trimmedTarget === 'console') {
      targets.push({
        target: 'pino-pretty',
        level: logLevel,
        options: {
          colorize: true,
          ignore: 'pid,hostname',
        }
      });
    }

    // Configure file transport
    else if (trimmedTarget === 'file') {
      const file = safeLogFilePath(logFilePath, 'app.log');
      targets.push({
        target: 'pino/file',
        level: logLevel,
        options: {
          destination: file,
          mkdir: true,
          sync: true,
        }
      });
    }

    // Configure OpenTelemetry transport
    else if (trimmedTarget === 'opentelemetry') {
      targets.push({
        target: 'pino-opentelemetry-transport',
        level: logLevel
      });
    }
  });

  // Return the config with transport object
  return {
    level: logLevel,
    transport: {
      targets
    }
  };
}

/**
 * Safely joins path segments and ensures directory paths end with a separator
 * @param {string} basePath The base directory path
 * @param {string} filename The filename to append
 * @returns {string} Properly joined path with filename
 */
export function safeLogFilePath(basePath: string, filename: string): string {
  // Normalize separators to forward slash
  const normalizedPath = basePath.replace(/[\\\/]+/g, '/');
  const normalizedFilename = filename.replace(/[\\\/]+/g, '/');
  
  // Ensure base path ends with a slash
  const baseWithSlash = normalizedPath.endsWith('/') 
    ? normalizedPath 
    : normalizedPath + '/';
  
  // Remove any leading slash from filename
  const cleanFilename = normalizedFilename.startsWith('/') 
    ? normalizedFilename.slice(1) 
    : normalizedFilename;
  
  // Join the path and filename
  return baseWithSlash + cleanFilename;
}
