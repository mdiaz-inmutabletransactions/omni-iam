/// <reference types="vite/client" />

// For import.meta.env
interface ImportMetaEnv {
    readonly VITE_KRATOS_BASE_URL: string;
    // Add your new variables here
    
  }
  
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
  
  // For process.env
  declare namespace NodeJS {
    interface ProcessEnv {
      KRATOS_BASE_URL: string;
      // Add your new variables here
      
    }
  }