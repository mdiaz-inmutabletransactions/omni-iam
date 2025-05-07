// app/core/Observability/logs.ts

// Detect if we're in a Node.js environment
const isNodeEnvironment = typeof process !== 'undefined' && 
                          process.versions != null && 
                          process.versions.node != null;

// Only import Node.js specific modules if we're in a Node.js environment
let pino: any = null;
let DateTime: any = null;
let pinoImportPromise: Promise<void> | null = null;

// Try to import Node.js modules only in Node.js environment
if (isNodeEnvironment) {
  // Create a promise to track when imports are complete
  pinoImportPromise = (async () => {
    try {
      // Use dynamic imports for Node.js modules
      const [pinoModule, luxonModule] = await Promise.all([
        import('pino'),
        import('luxon')
      ]);
      
      // Store the imported modules
      pino = pinoModule.default || pinoModule;
      DateTime = luxonModule.DateTime;
      
      console.log('Successfully imported pino and luxon');
    } catch (error) {
      console.warn('Failed to import pino or luxon:', error);
    }
  })();
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
  private initialized: boolean = false;
  private initPromise: Promise<void>;
  
  private constructor() {
    this.config = this.loadConfiguration();
    this.logger = createConsoleLogger(); // Start with console logger
    
    // Create and store initialization promise
    this.initPromise = this.initialize();
  }
  
  // Async initialization
  private async initialize(): Promise<void> {
    // Wait for Pino import if we're in Node environment
    if (isNodeEnvironment && pinoImportPromise) {
      try {
        await pinoImportPromise;
        
        // Check if pino was successfully imported
        if (pino) {
          // Now create the real logger
          this.logger = await this.createPinoLogger();
          console.log('Pino logger initialized successfully');
        } else {
          console.warn('Pino import completed but pino is not available');
        }
      } catch (error) {
        console.error('Failed to initialize Pino logger:', error);
      }
    }
    
    this.initialized = true;
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
  
  // Make this method async to use await inside
  private async createPinoLogger(): Promise<LoggerInstance> {
    // If pino isn't available, return a simple console logger
    if (!pino) {
      safeLog('info', {
        message: "Pino not available, using console logger as fallback",
        environment: isNodeEnvironment ? "server" : "browser"
      });
      return createConsoleLogger();
    }
    
    try {
      // Validate that we can access necessary file system functions
      if (this.config.LOG_TARGETS.includes('file')) {
        const fs = await import('fs');
        const path = await import('path');
        
        const logDir = this.config.LOG_FILE_PATH || './logs';
        
        // Ensure log directory exists
        if (!fs.existsSync(logDir)) {
          fs.mkdirSync(logDir, { recursive: true });
          console.log(`Created log directory: ${logDir}`);
        }
      }
      
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
      
      // Use a simple file destination for file logging
      if (this.config.LOG_TARGETS.includes('file') && this.config.LOG_FILE_PATH) {
        try {
          const fs = await import('fs');
          const path = await import('path');
          
          const logDir = this.config.LOG_FILE_PATH;
          const logFile = path.join(logDir, 'app.log');
          
          // Create a writable stream for the log file
          const fileStream = fs.createWriteStream(logFile, { flags: 'a' });
          
          // Create a multistream with console and file
          const streams = [
            { stream: process.stdout },
            { stream: fileStream }
          ];
          
          // Use Pino's multistream
          const { multistream } = await import('pino-multi-stream');
          return pino(baseOptions, multistream(streams));
        } catch (err) {
          console.error('Failed to create file stream:', err);
          // Fall back to standard Pino logger
          return pino(baseOptions);
        }
      } else {
        // Standard Pino logger
        return pino(baseOptions);
      }
    } catch (error) {
      console.error('Error creating Pino logger:', error);
      return createConsoleLogger();
    }
  }
  
  public static async getInstance(): Promise<LogManager> {
    if (!LogManager.instance) {
      LogManager.instance = new LogManager();
      // Ensure initialization is complete
      await LogManager.instance.initPromise;
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
  
  public async setConfig(config: Partial<LogSchema>): Promise<void> {
    // Ensure initialization is complete
    await this.initPromise;
    
    this.config = { ...this.config, ...config };
    this.logger = await this.createPinoLogger();
  }
  
  // Helper to create context-specific loggers
  public static async createContextLogger(context: LogContext = {}): Promise<LoggerInstance> {
    const instance = await LogManager.getInstance();
    return instance.createChildLogger(context);
  }

  // For testing and debugging
  public static async resetLogger(): Promise<void> {
    const instance = new LogManager();
    await instance.initPromise;
    LogManager.instance = instance;
  }
}

// Create a temporary console logger to use until the real logger is initialized
const tempLogger = createConsoleLogger();

// Export the logger instance
export const logger = tempLogger;

// Export helper functions for creating context loggers - note these now return promises
export const createContextLogger = async (context: LogContext = {}): Promise<LoggerInstance> => {
  return LogManager.createContextLogger(context);
};

// Export the manager itself for advanced usage
export const logManager = {
  getInstance: LogManager.getInstance,
  resetLogger: LogManager.resetLogger
};

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