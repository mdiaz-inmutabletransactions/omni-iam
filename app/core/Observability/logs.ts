// app/core/Observability/logs.ts

// Detect if we're in a Node.js environment
const isNodeEnvironment = typeof process !== 'undefined' && 
                          process.versions != null && 
                          process.versions.node != null;

// Import from the config module
import { 
  getEnv, 
  getBoolEnv,
  getNumEnv, 
  logDefaults,
  safeLog
} from '../config/enviroment';

// Initialize variables for Node modules
let pino: any = null;

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
  [key: string]: any; // Allow any other properties that might exist on the logger
}

// Type for logging context
export interface LogContext {
  [key: string]: string | number | boolean | object | null | undefined;
}

// Simple console logger for browser environments or before Pino is loaded
function createConsoleLogger(): LoggerInstance {
  return {
    trace: (data: any) => console.trace(data),
    debug: (data: any) => console.debug(data),
    info: (data: any) => console.info(data),
    warn: (data: any) => console.warn(data),
    error: (data: any) => console.error(data),
    fatal: (data: any) => console.error(data),
    child: (context: LogContext) => createConsoleLogger()
  };
}

// Get configuration
const logLevel = getEnv('LOG_LEVEL', logDefaults.LOG_LEVEL) || 'info';
const logTargetsStr = getEnv('LOG_TARGETS', logDefaults.LOG_TARGETS);
const logTargets = logTargetsStr ? logTargetsStr.split(',').map(t => t.trim()) : ['console'];
const logFilePath = getEnv('LOG_FILE_PATH', logDefaults.LOG_FILE_PATH) || './logs';
const logFormat = getEnv('LOG_FORMAT', logDefaults.LOG_FORMAT) || 'json';

// Try to dynamically load Pino in Node environment
if (isNodeEnvironment) {
  try {
    // Dynamic import of pino - this will execute immediately but won't block
    import('pino').then(pinoModule => {
      pino = pinoModule.default || pinoModule;
      
      // Now that pino is loaded, we can attempt to set up file logging if needed
      if (logTargets.includes('file') && pino) {
        // We need to dynamically import the node.js built-in modules for file system
        // Note: In Vite or modern bundlers, you need to use prefixes for Node built-ins
        import('node:fs').then(fs => {
          import('node:path').then(path => {
            // Create file logger and set up file logging as soon as modules are available
            setupFileLogging(pino, fs, path);
          }).catch(err => console.error('Failed to import path module:', err));
        }).catch(err => console.error('Failed to import fs module:', err));
      }
    }).catch(err => console.error('Failed to import pino module:', err));
  } catch (err) {
    console.error('Error initializing Pino logger:', err);
  }
}

// Initialize dual logging once modules are available
function setupFileLogging(pinoModule: any, fs: any, path: any) {
  try {
    // Check if directory exists
    if (!fs.existsSync(logFilePath)) {
      fs.mkdirSync(logFilePath, { recursive: true });
      console.log(`Created log directory: ${logFilePath}`);
    }
    
    // Configure dual logging if both targets are requested
    if (logTargets.includes('console') && logTargets.includes('file')) {
      const logFile = path.join(logFilePath, 'app.log');
      console.log(`Setting up dual logging to console and file: ${logFile}`);
      
      // Create file destination
      const fileDestination = pinoModule.destination({
        dest: logFile,
        sync: true, // Use synchronous mode
        mkdir: true
      });
      
      // Create loggers
      const fileLogger = pinoModule({ level: logLevel }, fileDestination);
      const consoleLogger = pinoModule({ level: logLevel });
      
      // Update the logger methods
      logger.trace = (data: any) => { consoleLogger.trace(data); fileLogger.trace(data); };
      logger.debug = (data: any) => { consoleLogger.debug(data); fileLogger.debug(data); };
      logger.info = (data: any) => { consoleLogger.info(data); fileLogger.info(data); };
      logger.warn = (data: any) => { consoleLogger.warn(data); fileLogger.warn(data); };
      logger.error = (data: any) => { consoleLogger.error(data); fileLogger.error(data); };
      logger.fatal = (data: any) => { consoleLogger.fatal(data); fileLogger.fatal(data); };
      
      // Custom child method for dual logging
      logger.child = (context: LogContext) => {
        const consoleChild = consoleLogger.child(context);
        const fileChild = fileLogger.child(context);
        
        return {
          trace: (data: any) => { consoleChild.trace(data); fileChild.trace(data); },
          debug: (data: any) => { consoleChild.debug(data); fileChild.debug(data); },
          info: (data: any) => { consoleChild.info(data); fileChild.info(data); },
          warn: (data: any) => { consoleChild.warn(data); fileChild.warn(data); },
          error: (data: any) => { consoleChild.error(data); fileChild.error(data); },
          fatal: (data: any) => { consoleChild.fatal(data); fileChild.fatal(data); },
          child: (childContext: LogContext) => {
            // Combine contexts for nested loggers
            const combinedContext = { ...context, ...childContext };
            return logger.child(combinedContext);
          }
        };
      };
      
      // Flush method for file operations
      logger.flush = () => {
        if (fileLogger.flush) fileLogger.flush();
      };
      
      // Set up exit handler to flush logs
      process.on('beforeExit', () => {
        if (fileLogger.flush) fileLogger.flush();
      });
      
      console.log('Dual logging successfully configured');
    } else if (logTargets.includes('file')) {
      // File-only logging
      const logFile = path.join(logFilePath, 'app.log');
      console.log(`Setting up file-only logging to: ${logFile}`);
      
      // Create file destination
      const destination = pinoModule.destination({
        dest: logFile,
        sync: true,
        mkdir: true
      });
      
      // Create file logger
      const fileLogger = pinoModule({ level: logLevel }, destination);
      
      // Replace logger methods
      logger.trace = fileLogger.trace.bind(fileLogger);
      logger.debug = fileLogger.debug.bind(fileLogger);
      logger.info = fileLogger.info.bind(fileLogger);
      logger.warn = fileLogger.warn.bind(fileLogger);
      logger.error = fileLogger.error.bind(fileLogger);
      logger.fatal = fileLogger.fatal.bind(fileLogger);
      logger.child = fileLogger.child.bind(fileLogger);
      logger.flush = fileLogger.flush?.bind(fileLogger);
      
      // Set up exit handler
      process.on('beforeExit', () => {
        if (fileLogger.flush) fileLogger.flush();
      });
      
      console.log('File-only logging successfully configured');
    }
  } catch (error) {
    console.error('Failed to set up file logging:', error);
  }
}

// Create initial console logger
const logger: LoggerInstance = createConsoleLogger();

// If we have Pino and console is the only target, set it up immediately
if (pino && !logTargets.includes('file') && logTargets.includes('console')) {
  const consoleLogger = pino({ level: logLevel });
  
  // Replace logger methods
  logger.trace = consoleLogger.trace.bind(consoleLogger);
  logger.debug = consoleLogger.debug.bind(consoleLogger);
  logger.info = consoleLogger.info.bind(consoleLogger);
  logger.warn = consoleLogger.warn.bind(consoleLogger);
  logger.error = consoleLogger.error.bind(consoleLogger);
  logger.fatal = consoleLogger.fatal.bind(consoleLogger);
  logger.child = consoleLogger.child.bind(consoleLogger);
  
  console.log('Console-only logging successfully configured');
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