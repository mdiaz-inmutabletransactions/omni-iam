// app/core/Observability/index.ts

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
import { ViteEnv } from '../ViteEnv/index';

// Initialize OpenTelemetry if enabled via ViteEnv
if (ViteEnv.OTEL_ENABLED) {
  initializeOpenTelemetry();
}

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