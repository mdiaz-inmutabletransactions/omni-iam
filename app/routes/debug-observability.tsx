// app/routes/debug-observability.tsx

import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { 
  logger, 
  createComponentLogger, 
  createOperationLogger, 
  logManager 
} from "~/core/Observability";
import { ViteEnv } from "~/core/ViteEnv/index";
import { useEffect, useState } from "react";

// Component logger for the debug route
const debugLogger = createComponentLogger("debug-observability");

// We'll only initialize OpenTelemetry on the server side
// to avoid Node.js modules being imported in the browser
export const loader = async () => {
  // Log that the debug page was accessed
  const operationLogger = createOperationLogger("debug-page-access", crypto.randomUUID());
  operationLogger.info("Debug page for Observability accessed");
  
  // Generate some sample logs at different levels
  logger.trace("This is a trace log for testing");
  logger.debug("This is a debug log for testing");
  logger.info("This is an info log for testing");
  logger.warn("This is a warning log for testing");
  logger.error("This is an error log for testing (test only)");

  // Get Observability configuration from ViteEnv
  const observabilityConfig = {
    logging: {
      LOG_LEVEL: ViteEnv.LOG_LEVEL,
      LOG_TARGETS: ViteEnv.LOG_TARGETS,
      LOG_FORMAT: ViteEnv.LOG_FORMAT,
      LOG_FILE_PATH: ViteEnv.LOG_FILE_PATH,
      LOG_FILE_ROTATION: ViteEnv.LOG_FILE_ROTATION,
      LOG_MAX_SIZE: ViteEnv.LOG_MAX_SIZE,
      LOG_INCLUDE_TIMESTAMP: ViteEnv.LOG_INCLUDE_TIMESTAMP,
      LOG_INCLUDE_HOSTNAME: ViteEnv.LOG_INCLUDE_HOSTNAME,
      REDACT_FIELDS: ViteEnv.REDACT_FIELDS,
    },
    telemetry: {
      OTEL_ENABLED: ViteEnv.OTEL_ENABLED,
      OTEL_SERVICE_NAME: ViteEnv.OTEL_SERVICE_NAME,
      OTEL_SERVICE_VERSION: ViteEnv.OTEL_SERVICE_VERSION,
      OTEL_EXPORTER_OTLP_ENDPOINT: ViteEnv.OTEL_EXPORTER_OTLP_ENDPOINT,
    },
    timezone: ViteEnv.TIMEZONE,
    locale: ViteEnv.LOCALE,
  };

  // Get the currently applied config from the LogManager
  const currentLoggerConfig = logManager.getConfig();

  // Return combined data
  return json({
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    observabilityConfig,
    currentLoggerConfig,
  });
};

// Create a browser-safe version of the logger for client-side use
function getBrowserLogger() {
  // Simple in-memory logger for the browser
  const logs: any[] = [];
  
  const log = (level: string, message: string) => {
    const timestamp = new Date().toISOString();
    logs.push({ level, message, timestamp });
    
    // Also log to console
    switch (level) {
      case 'trace':
        console.trace(message);
        break;
      case 'debug':
        console.debug(message);
        break;
      case 'info':
        console.info(message);
        break;
      case 'warn':
        console.warn(message);
        break;
      case 'error':
        console.error(message);
        break;
      default:
        console.log(`[${level}] ${message}`);
    }
    
    return logs;
  };
  
  return {
    logs,
    trace: (message: string) => log('trace', message),
    debug: (message: string) => log('debug', message),
    info: (message: string) => log('info', message),
    warn: (message: string) => log('warn', message),
    error: (message: string) => log('error', message),
  };
}

export default function DebugObservability() {
  const data = useLoaderData<typeof loader>();
  const [browserLogger, setBrowserLogger] = useState<ReturnType<typeof getBrowserLogger> | null>(null);
  const [traceActive, setTraceActive] = useState(false);

  // Initialize browser logger
  useEffect(() => {
    console.log("Debug Observability component mounted");
    setBrowserLogger(getBrowserLogger());
  }, []);

  // Generate client-side logs
  const generateClientLogs = () => {
    console.log("Generate logs button clicked");
    
    if (!browserLogger) {
      console.error("Browser logger not initialized");
      return;
    }
    
    try {
      // Generate logs with our browser-safe logger
      browserLogger.trace("Client trace log test");
      browserLogger.debug("Client debug log test");
      browserLogger.info("Client info log test");
      browserLogger.warn("Client warning log test");
      browserLogger.error("Client error log test (test only)");
      
      console.log("Logs generated successfully", browserLogger.logs);
    } catch (error) {
      console.error("Error generating logs:", error);
    }
  };

  // Simulate trace
  const startTrace = () => {
    console.log("Start trace button clicked");
    
    if (!browserLogger) {
      console.error("Browser logger not initialized");
      return;
    }
    
    try {
      setTraceActive(true);
      
      // Generate a trace ID that looks like a real trace ID
      const traceId = Array.from({ length: 32 }, () => 
        Math.floor(Math.random() * 16).toString(16)
      ).join('');
      
      browserLogger.info(`Started simulated trace (ID: ${traceId})`);
      
      // End the trace after 3 seconds
      setTimeout(() => {
        browserLogger.info(`Completed simulated trace (ID: ${traceId})`);
        setTraceActive(false);
      }, 3000);
    } catch (error) {
      console.error("Error starting trace:", error);
      setTraceActive(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Observability Debug Page</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <section className="bg-white shadow rounded-lg p-4">
          <h2 className="text-xl font-semibold mb-4">Environment Info</h2>
          <div className="mb-4">
            <p><strong>Timestamp:</strong> {data.timestamp}</p>
            <p><strong>Environment:</strong> {data.environment}</p>
            <p><strong>Timezone:</strong> {data.observabilityConfig.timezone}</p>
            <p><strong>Locale:</strong> {data.observabilityConfig.locale}</p>
          </div>
        </section>
        
        <section className="bg-white shadow rounded-lg p-4">
          <h2 className="text-xl font-semibold mb-4">Actions</h2>
          <div className="flex flex-col gap-3">
            <button 
              type="button"
              onClick={generateClientLogs}
              className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
            >
              Generate Test Logs
            </button>
            
            <button 
              type="button"
              onClick={startTrace}
              disabled={traceActive}
              className={`${traceActive ? 'bg-gray-400' : 'bg-purple-500 hover:bg-purple-600'} text-white px-4 py-2 rounded`}
            >
              {traceActive ? 'Trace Running...' : 'Start Test Trace'}
            </button>
          </div>
        </section>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <section className="bg-white shadow rounded-lg p-4">
          <h2 className="text-xl font-semibold mb-4">Logging Configuration</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Setting</th>
                  <th className="text-left py-2">Value</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.observabilityConfig.logging).map(([key, value]) => (
                  <tr key={key} className="border-b">
                    <td className="py-2">{key}</td>
                    <td className="py-2">{String(value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        
        <section className="bg-white shadow rounded-lg p-4">
          <h2 className="text-xl font-semibold mb-4">OpenTelemetry Configuration</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Setting</th>
                  <th className="text-left py-2">Value</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.observabilityConfig.telemetry).map(([key, value]) => (
                  <tr key={key} className="border-b">
                    <td className="py-2">{key}</td>
                    <td className="py-2">{String(value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      
      <section className="bg-white shadow rounded-lg p-4 mb-6">
        <h2 className="text-xl font-semibold mb-4">Test Logs ({browserLogger?.logs.length || 0})</h2>
        {browserLogger?.logs.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Timestamp</th>
                  <th className="text-left py-2">Level</th>
                  <th className="text-left py-2">Message</th>
                </tr>
              </thead>
              <tbody>
                {browserLogger.logs.map((log, i) => (
                  <tr key={i} className="border-b">
                    <td className="py-2">{log.timestamp}</td>
                    <td className="py-2">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        log.level === 'error' ? 'bg-red-200 text-red-800' :
                        log.level === 'warn' ? 'bg-yellow-200 text-yellow-800' :
                        log.level === 'info' ? 'bg-blue-200 text-blue-800' :
                        log.level === 'debug' ? 'bg-green-200 text-green-800' :
                        'bg-gray-200 text-gray-800'
                      }`}>
                        {log.level}
                      </span>
                    </td>
                    <td className="py-2">{log.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500">No test logs generated yet. Click "Generate Test Logs" to create some.</p>
        )}
      </section>
      
      <section className="bg-white shadow rounded-lg p-4">
        <h2 className="text-xl font-semibold mb-4">Help & Information</h2>
        <div className="prose max-w-none">
          <p>This page helps you debug the Observability system in your application.</p>
          
          <div className="mt-3 p-4 bg-blue-50 border-l-4 border-blue-500 text-blue-700">
            <h3 className="font-bold">Browser & Server Observability</h3>
            <p>This debug page simulates logging and tracing in the browser while using real OpenTelemetry logging on the server.</p>
            <p>Server-side logs and traces are being sent to your configured targets. Browser logs are displayed in the table above and in the browser console.</p>
          </div>
          
          <h3 className="mt-4">What to look for:</h3>
          <ul>
            <li>Check that configuration values match what you expect</li>
            <li>Verify that server logs appear in your configured targets</li>
            <li>Use the buttons to generate browser-side logs and traces</li>
            <li>Check browser console for additional debugging information</li>
          </ul>
        </div>
      </section>
    </div>
  );
}