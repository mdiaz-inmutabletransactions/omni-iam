// app/core/Observability/opentelemetry.ts

// For ESM compatibility, we'll use dynamic imports instead of conditional requires
let NodeSDK: any;
let getNodeAutoInstrumentations: any;
let OTLPTraceExporter: any;
let BatchSpanProcessor: any;
let resourceFromAttributes: any;
let SemanticResourceAttributes: any;

// Detect if we're in a Node.js environment
const isNodeEnvironment = typeof process !== 'undefined' && 
                          process.versions != null && 
                          process.versions.node != null;

// Only import OpenTelemetry modules in a Node.js environment
async function loadNodeModules() {
  if (isNodeEnvironment) {
    try {
      // Dynamic imports for Node.js modules
      const { NodeSDK: _NodeSDK } = await import('@opentelemetry/sdk-node');
      const { getNodeAutoInstrumentations: _getNodeAutoInstrumentations } = await import('@opentelemetry/auto-instrumentations-node');
      const { OTLPTraceExporter: _OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-proto');
      const { BatchSpanProcessor: _BatchSpanProcessor } = await import('@opentelemetry/sdk-trace-base');
      const { resourceFromAttributes: _resourceFromAttributes } = await import('@opentelemetry/resources');
      const { SemanticResourceAttributes: _SemanticResourceAttributes } = await import('@opentelemetry/semantic-conventions');
      
      // Assign to variables
      NodeSDK = _NodeSDK;
      getNodeAutoInstrumentations = _getNodeAutoInstrumentations;
      OTLPTraceExporter = _OTLPTraceExporter;
      BatchSpanProcessor = _BatchSpanProcessor;
      resourceFromAttributes = _resourceFromAttributes;
      SemanticResourceAttributes = _SemanticResourceAttributes;
    } catch (error) {
      console.warn('Failed to import OpenTelemetry modules:', error);
    }
  }
}

// Import from shared config
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
export async function initializeOpenTelemetry(): Promise<void> {
  // Load modules first
  await loadNodeModules();
  
  // Skip if not in Node.js environment
  if (!isNodeEnvironment) {
    safeLog('info', {
      msg: 'OpenTelemetry is only available in Node.js environment',
      component: 'OpenTelemetry'
    });
    return;
  }
  
  // Skip if any required modules are missing
  if (!NodeSDK || !getNodeAutoInstrumentations || !OTLPTraceExporter || 
      !BatchSpanProcessor || !resourceFromAttributes || !SemanticResourceAttributes) {
    safeLog('warn', {
      msg: 'OpenTelemetry modules not available',
      component: 'OpenTelemetry'
    });
    return;
  }
  
  // Load config directly
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
    OTEL_SERVICE_NAME: getEnv('OTEL_SERVICE_NAME', otelDefaults.OTEL_SERVICE_NAME) || '',
    OTEL_SERVICE_VERSION: getEnv('OTEL_SERVICE_VERSION', otelDefaults.OTEL_SERVICE_VERSION) || '',
    OTEL_EXPORTER_OTLP_ENDPOINT: getEnv('OTEL_EXPORTER_OTLP_ENDPOINT', otelDefaults.OTEL_EXPORTER_OTLP_ENDPOINT) || '',
    OTEL_EXPORTER_OTLP_HEADERS: getEnv('OTEL_EXPORTER_OTLP_HEADERS'),
    OTEL_ATTRIBUTE_VALUE_LENGTH_LIMIT: getEnv('OTEL_ATTRIBUTE_VALUE_LENGTH_LIMIT') 
      ? parseInt(getEnv('OTEL_ATTRIBUTE_VALUE_LENGTH_LIMIT')!, 10) 
      : undefined,
  };
}