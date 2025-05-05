// app/core/Observability/opentelemetry.ts

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { ViteEnv } from '../ViteEnv/index';
import { logger } from './logs';
// Import the resourceFromAttributes helper from @opentelemetry/resources
import { resourceFromAttributes } from '@opentelemetry/resources';
// Import semantic conventions
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

// Configuration for OpenTelemetry with proper types
export interface TelemetryConfig {
  OTEL_ENABLED: boolean;
  OTEL_SERVICE_NAME: string;
  OTEL_SERVICE_VERSION: string;
  OTEL_EXPORTER_OTLP_ENDPOINT: string;
  OTEL_EXPORTER_OTLP_HEADERS?: string;
  OTEL_ATTRIBUTE_VALUE_LENGTH_LIMIT?: number;
}

// Default configuration
const defaultConfig: TelemetryConfig = {
  OTEL_ENABLED: process.env.NODE_ENV === 'production',
  OTEL_SERVICE_NAME: 'omni-iam',
  OTEL_SERVICE_VERSION: '1.0.0',
  OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4317',
};

// Initialize OpenTelemetry
export function initializeOpenTelemetry(): void {
  // Skip if disabled
  if (!process.env.OTEL_ENABLED && !defaultConfig.OTEL_ENABLED) {
    logger.info('OpenTelemetry is disabled');
    return;
  }
  
  try {
    // Load configuration
    const config = loadTelemetryConfig();
    
    // Setup trace exporter
    const traceExporter = new OTLPTraceExporter({
      url: config.OTEL_EXPORTER_OTLP_ENDPOINT + '/v1/traces',
      headers: config.OTEL_EXPORTER_OTLP_HEADERS 
        ? JSON.parse(config.OTEL_EXPORTER_OTLP_HEADERS) 
        : undefined,
    });
    
    // Create resource using resourceFromAttributes helper function
    // This is the correct way to create a resource in OpenTelemetry v2
    // This is the custom resource creation
    const resource = resourceFromAttributes({
      [SemanticResourceAttributes.SERVICE_NAME]: config.OTEL_SERVICE_NAME,
      [SemanticResourceAttributes.SERVICE_VERSION]: config.OTEL_SERVICE_VERSION,
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: ViteEnv.VITE_PUBLIC_ENV,
    });
    
    // Create SDK with auto-instrumentation
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
    logger.info(`OpenTelemetry initialized for service ${config.OTEL_SERVICE_NAME}`);
    
    // Register shutdown
    process.on('SIGTERM', () => {
      sdk.shutdown()
        .then(() => logger.info('OpenTelemetry SDK shut down successfully'))
        .catch((error: Error) => logger.error({ 
          error: { 
            message: error.message, 
            stack: error.stack 
          } 
        }, 'Error shutting down OpenTelemetry SDK'))
        .finally(() => process.exit(0));
    });
  } catch (error) {
    logger.error({ 
      error: error instanceof Error 
        ? { message: error.message, stack: error.stack } 
        : { message: String(error) }
    }, 'Failed to initialize OpenTelemetry');
  }
}

// Load telemetry configuration from environment variables
function loadTelemetryConfig(): TelemetryConfig {
  return {
    OTEL_ENABLED: process.env.OTEL_ENABLED === 'true' || defaultConfig.OTEL_ENABLED,
    OTEL_SERVICE_NAME: process.env.OTEL_SERVICE_NAME || defaultConfig.OTEL_SERVICE_NAME,
    OTEL_SERVICE_VERSION: process.env.OTEL_SERVICE_VERSION || defaultConfig.OTEL_SERVICE_VERSION,
    OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || defaultConfig.OTEL_EXPORTER_OTLP_ENDPOINT,
    OTEL_EXPORTER_OTLP_HEADERS: process.env.OTEL_EXPORTER_OTLP_HEADERS,
    OTEL_ATTRIBUTE_VALUE_LENGTH_LIMIT: process.env.OTEL_ATTRIBUTE_VALUE_LENGTH_LIMIT 
      ? parseInt(process.env.OTEL_ATTRIBUTE_VALUE_LENGTH_LIMIT, 10) 
      : undefined,
  };
}