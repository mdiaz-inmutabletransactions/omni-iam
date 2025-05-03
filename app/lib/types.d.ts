declare module 'luxon' {
  export class DateTime {
    static utc(): DateTime;
    static now(): DateTime;
    static fromISO(text: string): DateTime;
    static fromJSDate(date: Date): DateTime;
    
    setZone(zone: string): DateTime;
    setLocale(locale: string): DateTime;
    toLocaleString(format: any): string;
    isValid: boolean;
    
    static DATETIME_FULL: any;
    static DATETIME_SHORT: any;
    static DATE_SHORT: any;
  }
  
  export class Duration {}
  export class Interval {}
  export class Settings {}
  export class Info {
    static listTimeZones(): string[];
  }
}

declare module 'timezone-support' {
  export function listTimeZones(): string[];
  export function findTimeZone(name: string): any;
}
