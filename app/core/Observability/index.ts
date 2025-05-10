// app/core/Observability/index.ts

// First import from ViteEnv (after it's been initialized without circular dependencies)
import { ViteEnv } from '../ViteEnv';
import { logger, createContextLogger, logManager } from './logs';
import type { LogContext, LoggerInstance, LogLevel, LogTarget, LogFormat, LogSchema } from './logs';
import { 
    
  // Existing functions
  createComponentLogger,
  createOperationLogger,
  createRequestLogger,
  
  // Add these missing exports
  createEventLogger,
  createMetricLogger,
  logError,
  
  // Utility functions
  formatObject,
  redactSensitiveInfo,
  safeStringify,
  
  // OpenTelemetry
  getTraceparentHeader,
  toOtelLogRecord,
  createSpanContext,
  getTraceContext,

  setTraceContext,
  createNewSpan,

} from './logUtils';

import type { FormatObjectOptions } from './logUtils';
import { initializeOpenTelemetry } from './opentelemetry';

// Detect if we're in a Node.js environment
const isNodeEnvironment = typeof process !== 'undefined' && 
                        process.versions != null && 
                        process.versions.node != null;

// Now that the circular dependency is resolved, we can safely use ViteEnv
// Initialize OpenTelemetry if enabled via ViteEnv, but only in Node.js environment
if (isNodeEnvironment && ViteEnv.OTEL_ENABLED) {
  // Call the async function but don't await it
  initializeOpenTelemetry().catch(err => {
    console.error('Failed to initialize OpenTelemetry:', err);
  });
}

// Use the basic logger for initialization since createContextLogger is now async
console.info({
  msg: "Observability module initialized",
  logLevel: ViteEnv.LOG_LEVEL,
  logTargets: ViteEnv.LOG_TARGETS,
  otelEnabled: ViteEnv.OTEL_ENABLED,
  environment: isNodeEnvironment ? 'server' : 'browser'
});

// Initialize logger asynchronously (but don't block module initialization)
(async () => {
  try {
    const obsLogger = await createContextLogger({
      component: 'Observability',
      module: 'core',
      operation: 'initialization'
    });
    
    obsLogger.info({//TODO: corregit estoYAAAAAAAA!
      Body: "Observability context logger initialized",
      SeverityText: ViteEnv.LOG_LEVEL,
      logTargets: ViteEnv.LOG_TARGETS,
      otelEnabled: ViteEnv.OTEL_ENABLED,
      environment: isNodeEnvironment ? 'server' : 'browser'
    });
  } catch (error) {
    console.error('Failed to initialize Observability logger:', error);
  }
})();

// Export everything from the observability module
export {

  // core
  logger,
  logManager,
  createContextLogger,
  
  // Existing functions
  createComponentLogger,
  createOperationLogger,
  createRequestLogger,
  
  // Add these missing exports
  createEventLogger,
  createMetricLogger,
  logError,
  
  // Utility functions
  formatObject,
  redactSensitiveInfo,
  safeStringify,
  
  // OpenTelemetry
  initializeOpenTelemetry,
  getTraceparentHeader,
  toOtelLogRecord,
  createSpanContext,
  getTraceContext,
  setTraceContext,
  createNewSpan,
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