// app/core/Observability/opentelemetry.ts

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

// Import from shared config instead of directly from ViteEnv
import { 
  getEnv, 
  getBoolEnv, 
  otelDefaults,
  safeLog 
} from '../config/enviroment';

// Configuration for OpenTelemetry with proper types
export interface TelemetryConfig {
  OTEL_ENABLED: boolean;
  OTEL_SERVICE_NAME: string;
  OTEL_SERVICE_VERSION: string;
  OTEL_EXPORTER_OTLP_ENDPOINT: string;
  OTEL_EXPORTER_OTLP_HEADERS?: string;
  OTEL_ATTRIBUTE_VALUE_LENGTH_LIMIT?: number;
}

// Initialize OpenTelemetry
export function initializeOpenTelemetry(): void {
  // Load config directly instead of from ViteEnv
  const config = loadTelemetryConfig();
  
  // Skip if disabled
  if (!config.OTEL_ENABLED) {
    safeLog('info', {
      msg: 'OpenTelemetry is disabled',
      component: 'OpenTelemetry'
    });
    return;
  }
  
  try {
    // Setup trace exporter with structured logging
    safeLog('info', {
      msg: 'Initializing OpenTelemetry',
      endpoint: config.OTEL_EXPORTER_OTLP_ENDPOINT,
      serviceName: config.OTEL_SERVICE_NAME,
      serviceVersion: config.OTEL_SERVICE_VERSION,
      component: 'OpenTelemetry'
    });
    
    // Setup trace exporter
    const traceExporter = new OTLPTraceExporter({
      url: config.OTEL_EXPORTER_OTLP_ENDPOINT + '/v1/traces',
      headers: config.OTEL_EXPORTER_OTLP_HEADERS 
        ? JSON.parse(config.OTEL_EXPORTER_OTLP_HEADERS) 
        : undefined,
    });
    
    // Get environment for resource attributes
    const environment = getEnv('VITE_PUBLIC_ENV', 'development');
    
    // Create custom resource using resourceFromAttributes
    const resource = resourceFromAttributes({
      [SemanticResourceAttributes.SERVICE_NAME]: config.OTEL_SERVICE_NAME,
      [SemanticResourceAttributes.SERVICE_VERSION]: config.OTEL_SERVICE_VERSION,
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: environment,
    });
    
    // Create SDK with auto-instrumentation and our custom resource
    const sdk = new NodeSDK({
      resource: resource,
      spanProcessor: new BatchSpanProcessor(traceExporter),
      instrumentations: [getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: true },
        '@opentelemetry/instrumentation-http': { enabled: true },
        '@opentelemetry/instrumentation-express': { enabled: true },
      })],
    });
    
    // Start OpenTelemetry and register a shutdown handler
    sdk.start();
    safeLog('info', {
      msg: 'OpenTelemetry initialized successfully',
      serviceName: config.OTEL_SERVICE_NAME,
      component: 'OpenTelemetry'
    });
    
    // Register shutdown
    process.on('SIGTERM', () => {
      sdk.shutdown()
        .then(() => safeLog('info', { 
          msg: 'OpenTelemetry SDK shut down successfully',
          component: 'OpenTelemetry'
        }))
        .catch((error: Error) => safeLog('error', { 
          msg: 'Error shutting down OpenTelemetry SDK',
          error: { 
            message: error.message, 
            stack: error.stack 
          },
          component: 'OpenTelemetry'
        }))
        .finally(() => process.exit(0));
    });
  } catch (error) {
    safeLog('error', { 
      msg: 'Failed to initialize OpenTelemetry',
      error: error instanceof Error 
        ? { message: error.message, stack: error.stack } 
        : { message: String(error) },
      component: 'OpenTelemetry'
    });
  }
}

// Load telemetry configuration from environment variables
function loadTelemetryConfig(): TelemetryConfig {
  return {
    OTEL_ENABLED: getBoolEnv('OTEL_ENABLED', otelDefaults.OTEL_ENABLED === 'true'),
    OTEL_SERVICE_NAME: getEnv('OTEL_SERVICE_NAME', otelDefaults.OTEL_SERVICE_NAME),
    OTEL_SERVICE_VERSION: getEnv('OTEL_SERVICE_VERSION', otelDefaults.OTEL_SERVICE_VERSION),
    OTEL_EXPORTER_OTLP_ENDPOINT: getEnv('OTEL_EXPORTER_OTLP_ENDPOINT', otelDefaults.OTEL_EXPORTER_OTLP_ENDPOINT),
    OTEL_EXPORTER_OTLP_HEADERS: getEnv('OTEL_EXPORTER_OTLP_HEADERS'),
    OTEL_ATTRIBUTE_VALUE_LENGTH_LIMIT: getEnv('OTEL_ATTRIBUTE_VALUE_LENGTH_LIMIT') 
      ? parseInt(getEnv('OTEL_ATTRIBUTE_VALUE_LENGTH_LIMIT')!, 10) 
      : undefined,
  };
}