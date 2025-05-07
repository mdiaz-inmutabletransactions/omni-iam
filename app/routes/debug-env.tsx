// app/routes/debug-env.tsx
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { ViteEnv } from "~/core/ViteEnv/index";
import { useEffect, useState } from "react";

// Get all environment variables programmatically from ViteEnv
const getViteEnvVariables = () => {
  const viteEnvValues: Record<string, any> = {};
  
  // Get all keys from the ViteEnv object
  const viteEnvKeys = Object.keys(ViteEnv);
  
  // Extract values for each key
  viteEnvKeys.forEach(key => {
    // Skip functions and internal properties
    if (typeof (ViteEnv as any)[key] !== 'function' && !key.startsWith('_')) {
      const value = (ViteEnv as any)[key];
      // Redact sensitive values
      if (key.includes('SECRET') || key.includes('PASSWORD') || key.includes('TOKEN') || key.includes('KEY') || key.includes('AUTH')) {
        viteEnvValues[key] = '[REDACTED]';
      } else {
        viteEnvValues[key] = value;
      }
    }
  });
  
  return viteEnvValues;
};

// Get all process.env variables (filtered for safety)
// This function is only called server-side in the loader
const getProcessEnvVariables = () => {
  if (typeof process === 'undefined' || !process.env) return {};
  
  const processEnvValues: Record<string, any> = {};
  const processEnvKeys = Object.keys(process.env);
  
  // Filter out sensitive variables
  const sensitiveKeywords = ['SECRET', 'PASSWORD', 'KEY', 'TOKEN', 'AUTH'];
  
  processEnvKeys.forEach(key => {
    // Skip sensitive variables for security
    const isSensitive = sensitiveKeywords.some(keyword => 
      key.toUpperCase().includes(keyword)
    );
    
    if (!isSensitive) {
      processEnvValues[key] = process.env[key];
    } else {
      processEnvValues[key] = '[REDACTED]';
    }
  });
  
  return processEnvValues;
};

export const loader = async () => {
  // Server-side environment variables
  const serverProcessEnv = getProcessEnvVariables();
  const serverViteEnv = getViteEnvVariables();
  
  // Collect all unique environment variable names
  const allEnvKeys = [
    ...Object.keys(serverProcessEnv),
    ...Object.keys(serverViteEnv),
  ].filter((value, index, self) => self.indexOf(value) === index); // Remove duplicates
  
  return json({
    server: {
      processEnv: serverProcessEnv,
      viteEnv: serverViteEnv
    },
    allEnvKeys
  });
};

export default function DebugEnv() {
  const data = useLoaderData<typeof loader>();
  const [clientEnv, setClientEnv] = useState<{
    processEnv: Record<string, any>;
    importMetaEnv: Record<string, any>;
    viteEnv: Record<string, any>;
  } | null>(null);
  
  useEffect(() => {
    // Client-side environment detection
    try {
      const processEnvVars: Record<string, any> = {};
      const importMetaEnvVars: Record<string, any> = {};
      const viteEnvVars: Record<string, any> = {};
      
      // Set of all variables to check
      const allVarNames = new Set([
        // Start with all the keys we discovered on the server
        ...data.allEnvKeys,
        
        // Add known Vite environment variables
        'NODE_ENV', 'MODE', 'DEV', 'PROD', 'SSR',
        
        // Add common custom variables - only add VITE_ prefixed ones for client-side
        'VITE_KRATOS_BASE_URL', 'VITE_PUBLIC_API_URL', 'VITE_PUBLIC_ENV'
      ]);
      
      // Check each variable across all environments
      Array.from(allVarNames).forEach(key => {
        // Skip sensitive variables 
        if (key.includes('SECRET') || key.includes('PASSWORD') || key.includes('TOKEN') || 
            key.includes('KEY') || key.includes('AUTH')) {
          processEnvVars[key] = '[REDACTED]';
          importMetaEnvVars[key] = '[REDACTED]';
          viteEnvVars[key] = '[REDACTED]';
          return;
        }
        
        // 1. Check process.env variables - these will mostly be undefined in browser
        try {
          // In the browser, process.env may not exist at all
          const hasProcessEnv = typeof process !== 'undefined' && process.env;
          const value = hasProcessEnv ? (process.env as any)[key] : undefined;
          processEnvVars[key] = value;
        } catch (err) {
          processEnvVars[key] = undefined;
        }
        
        // 2. Check import.meta.env variables - these are most reliable in browser
        try {
          const hasImportMeta = typeof import.meta !== 'undefined' && import.meta.env;
          const value = hasImportMeta ? (import.meta.env as any)[key] : undefined;
          importMetaEnvVars[key] = value;
        } catch (err) {
          importMetaEnvVars[key] = undefined;
        }
        
        // 3. Check ViteEnv variables - this should have both client & server vars
        try {
          const value = (ViteEnv as any)[key];
          viteEnvVars[key] = value;
        } catch (err) {
          viteEnvVars[key] = undefined;
        }
        
        // Also check for VITE_ prefixed variables specifically
        if (!key.startsWith('VITE_')) {
          const viteKey = `VITE_${key}`;
          
          try {
            const hasImportMeta = typeof import.meta !== 'undefined' && import.meta.env;
            const value = hasImportMeta ? (import.meta.env as any)[viteKey] : undefined;
            
            if (value !== undefined) {
              importMetaEnvVars[viteKey] = value;
              allVarNames.add(viteKey);
            }
          } catch (err) {
            // Ignore errors for checks
          }
        }
      });
      
      // Filter out undefined values for cleaner display
      const filterUndefined = (obj: Record<string, any>) => {
        const result: Record<string, any> = {};
        for (const [key, value] of Object.entries(obj)) {
          if (value !== undefined) {
            result[key] = value;
          }
        }
        return result;
      };
      
      setClientEnv({
        processEnv: filterUndefined(processEnvVars),
        importMetaEnv: filterUndefined(importMetaEnvVars),
        viteEnv: filterUndefined(viteEnvVars)
      });
    } catch (err) {
      console.error("Error accessing client environment:", err);
      setClientEnv({ 
        processEnv: { error: String(err) },
        importMetaEnv: { error: String(err) },
        viteEnv: { error: String(err) }
      });
    }
  }, [data.allEnvKeys]);

  // A component to display environment variables
  const EnvDisplay = ({ 
    title, 
    variables 
  }: { 
    title: string; 
    variables: Record<string, any> 
  }) => (
    <div>
      <h3>{title}</h3>
      {Object.keys(variables).length > 0 ? (
        <pre style={{ 
          background: "#f1f1f1", 
          padding: "1rem", 
          borderRadius: "4px",
          overflow: "auto",
          maxHeight: "400px"
        }}>
          {JSON.stringify(variables, null, 2)}
        </pre>
      ) : (
        <p>No variables available</p>
      )}
    </div>
  );

  return (
    <div style={{ 
      fontFamily: "system-ui, sans-serif", 
      lineHeight: "1.5",
      padding: "2rem"
    }}>
      <h1>Environment Variables Debug</h1>
      
      <div style={{ marginBottom: "2rem" }}>
        <h2>Server-Side Environment (SSR)</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <EnvDisplay 
            title="process.env variables" 
            variables={data.server.processEnv} 
          />
          <EnvDisplay 
            title="ViteEnv manager variables" 
            variables={data.server.viteEnv} 
          />
        </div>
      </div>
      
      <div>
        <h2>Client-Side Environment</h2>
        {clientEnv ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" }}>
            <EnvDisplay 
              title="process.env variables" 
              variables={clientEnv.processEnv} 
            />
            <EnvDisplay 
              title="import.meta.env variables" 
              variables={clientEnv.importMetaEnv} 
            />
            <EnvDisplay 
              title="ViteEnv manager variables" 
              variables={clientEnv.viteEnv} 
            />
          </div>
        ) : (
          <p>Loading client environment...</p>
        )}
      </div>
      
      <div style={{ 
        marginTop: "2rem", 
        padding: "1rem", 
        background: "#f8f8f8", 
        borderRadius: "4px" 
      }}>
        <h3>Notes:</h3>
        <ul>
          <li>This page shows only variables that actually have values (not undefined)</li>
          <li>Client-side <code>process.env</code> only works for variables explicitly defined in <code>vite.config.ts</code> using the <code>define</code> option</li>
          <li>Only variables with <code>VITE_</code> prefix are automatically exposed via <code>import.meta.env</code></li>
          <li>Variables marked as <code>[REDACTED]</code> may contain sensitive information</li>
          <li>Server-only variables will not appear in client-side environment</li>
        </ul>
      </div>
    </div>
  );
}