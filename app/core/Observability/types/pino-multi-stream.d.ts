// types/pino-multi-stream.d.ts
declare module 'pino-multi-stream' {
    import { DestinationStream } from 'pino';
    
    interface StreamEntry {
      stream: NodeJS.WritableStream;
      level?: string;
    }
    
    export function multistream(streams: StreamEntry[]): DestinationStream;
    
    // Add other exports as needed
  }