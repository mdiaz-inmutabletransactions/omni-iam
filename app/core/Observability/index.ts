// app/core/Observability/index.ts

// First import from ViteEnv (after it's been initialized without circular dependencies)
import { ViteEnv } from '../ViteEnv';
import { logger, createContextLogger, logManager } from './logs';
import type { LogContext, LoggerInstance, LogLevel, LogTarget, LogFormat, LogSchema } from './logs';
import { 
  formatObject, 
  createComponentLogger, 
  createOperationLogger, 
  createRequestLogger,
  redactSensitiveInfo,
  safeStringify
} from './logUtils';
import type { FormatObjectOptions } from './logUtils';
import { initializeOpenTelemetry } from './opentelemetry';

// Now that the circular dependency is resolved, we can safely use ViteEnv
// Initialize OpenTelemetry if enabled via ViteEnv
if (ViteEnv.OTEL_ENABLED) {
  initializeOpenTelemetry();
}

// Set up an initialization example with structured logging
const obsLogger = createContextLogger({
  component: 'Observability',
  module: 'core',
  operation: 'initialization'
});

obsLogger.info({
  msg: "Observability module initialized",
  logLevel: ViteEnv.LOG_LEVEL,
  logTargets: ViteEnv.LOG_TARGETS,
  otelEnabled: ViteEnv.OTEL_ENABLED
});

// Export everything from the observability module
export {
  // Core logger
  logger,
  logManager,
  createContextLogger,
  
  // Utility functions
  formatObject,
  createComponentLogger,
  createOperationLogger,
  createRequestLogger,
  redactSensitiveInfo,
  safeStringify,
  
  // OpenTelemetry
  initializeOpenTelemetry,
};

// Export types properly with export type
export type {
  // Types
  LogContext,
  LoggerInstance,
  LogLevel,
  LogTarget,
  LogFormat,
  LogSchema,
  FormatObjectOptions,
};