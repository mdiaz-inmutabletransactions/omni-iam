// 1. Define your environment variable schema
export type EnvSchema = {
    // Server-side only (only available in Remix loaders/actions)
    SERVER_SECRET: string;
    DATABASE_URL: string;
    TIMEZONE: string;
    LOCALE: string;
    KARTOS_BASE_URL: string;
  
    // Public (exposed to client)
    VITE_PUBLIC_API_URL: string;
    VITE_PUBLIC_ENV: 'development' | 'production' | 'test';
    
    // Optional with defaults
    VITE_DEBUG_MODE?: boolean;
    VITE_LOCALE?: string;
  };
  
  // 2. Default values
  const defaults: EnvSchema = {
    SERVER_SECRET: 'default-secret',
    DATABASE_URL: 'postgres://localhost:5432/mydb',
    VITE_PUBLIC_API_URL: 'http://localhost:3000/api',
    VITE_PUBLIC_ENV: 'development',
    VITE_DEBUG_MODE: false,
    VITE_LOCALE: 'en-US',
    TIMEZONE: 'America/Mexico_Citys',
    LOCALE: 'es-MX',
    KARTOS_BASE_URL: 'http://localhost:3000',
  };
  
  // 3. Runtime validators
  const validators: { [K in keyof EnvSchema]?: (value: any) => boolean } = {
    SERVER_SECRET: (v) => typeof v === 'string' && v.length >= 32,
    DATABASE_URL: (v) => typeof v === 'string' && v.length > 0,
    VITE_PUBLIC_ENV: (v) => ['development', 'production', 'test'].includes(v),
    VITE_DEBUG_MODE: (v) => typeof v === 'boolean',
    VITE_LOCALE: (v) => /^[a-z]{2}-[A-Z]{2}$/.test(v),
    TIMEZONE: (v) => typeof v === 'string',
    LOCALE: (v) => typeof v === 'string',
    KARTOS_BASE_URL: (v) => typeof v === 'string',
  };
  
  // 4. Type transformers
  const transformers: { [K in keyof EnvSchema]?: (value: string) => any } = {
    VITE_DEBUG_MODE: (v) => v === 'true',
    VITE_PUBLIC_ENV: (v) => v.toLowerCase() as 'development' | 'production' | 'test'
  };
  
  class ViteEnvManager {
    private static instance: ViteEnvManager;
    private env: EnvSchema;
  
    private constructor() {
      this.env = this.loadEnvironment();
      this.validateEnvironment();
    }
  
    public static get(): EnvSchema {
      if (!ViteEnvManager.instance) {
        ViteEnvManager.instance = new ViteEnvManager();
      }
      return ViteEnvManager.instance.env;
    }

    public static set<K extends keyof EnvSchema>(key: K, value: EnvSchema[K]): void {
      const instance = ViteEnvManager.instance || new ViteEnvManager();
      
      if (validators[key] && !validators[key]!(value)) {
        console.warn(`Invalid value for ${key}: ${value}`);
        return;
      }
  
      instance.env[key] = value;
      
      // Update the appropriate environment source
      if (key.startsWith('VITE_')) {
        import.meta.env[key] = String(value);
      } else {
        process.env[key] = String(value);
      }
    }
  
    private loadEnvironment(): EnvSchema {
      const loaded = { ...defaults }; // Start with defaults
    
      for (const key of Object.keys(defaults) as Array<keyof EnvSchema>) {
        // Get raw value from correct source
        const rawValue = key.startsWith('VITE_')
          ? import.meta.env[key]
          : process.env[key];
    
        // Skip if no value found (keep default)
        if (rawValue === undefined) continue;
    
        // Apply transformer if exists
        if (transformers[key]) {
          loaded[key] = transformers[key]!(rawValue) as never;
        } else {
          loaded[key] = rawValue as never;
        }
      }
    
      return loaded;
    }
  
  
    private validateEnvironment(): void {
      for (const key in validators) {
        const envKey = key as keyof EnvSchema;
        const validator = validators[envKey];
        const value = this.env[envKey];
        const defaultValue = defaults[envKey];
  
        if (validator && value !== undefined && !validator(value)) {
          console.warn(`Invalid environment value for ${envKey}: ${value}. Using default.`);
          (this.env as any)[envKey] = defaultValue;
        } else if (value === undefined) {
          (this.env as any)[envKey] = defaultValue;
        }
      }
    }
  

    public static reload(): void {
      ViteEnvManager.instance = new ViteEnvManager();
    }

  }
  
  // Public interface
  export const ViteEnv = ViteEnvManager.get();
  export const setEnv = ViteEnvManager.set;
  export const reloadEnv = ViteEnvManager.reload;