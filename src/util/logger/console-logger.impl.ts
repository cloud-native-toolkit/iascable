import {LoggerApi} from './logger.api';

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

export const logLevelFromString = (logLevel?: string, defaultLogLevel: LogLevel = LogLevel.INFO): LogLevel => {
  if (logLevel === 'debug') {
    return LogLevel.DEBUG;
  } else if (logLevel === 'error') {
    return LogLevel.ERROR;
  } else if (logLevel === 'warn') {
    return LogLevel.WARN;
  } else if (logLevel === 'info') {
    return LogLevel.INFO;
  }

  return defaultLogLevel;
}

export class ConsoleLogger implements LoggerApi {
  private logLevel: LogLevel;

  constructor(logLevel: string | undefined = process.env.LOG_LEVEL) {
    this.logLevel = logLevelFromString(logLevel);
  }

  debug(message: string, context?: any): void {
    if (!this.isLogEnabled(LogLevel.DEBUG)) return;

    if (context) {
      console.log(message, context);
    } else {
      console.log(message);
    }
  }

  error(message: string, context?: any): void {
    if (!this.isLogEnabled(LogLevel.ERROR)) return;

    if (context) {
      console.error(message, context);
    } else {
      console.error(message);
    }
  }

  info(message: string, context?: any): void {
    if (!this.isLogEnabled(LogLevel.INFO)) return;

    if (context) {
      console.log(message, context);
    } else {
      console.log(message);
    }
  }

  warn(message: string, context?: any): void {
    if (!this.isLogEnabled(LogLevel.WARN)) return;

    if (context) {
      console.log(message, context);
    } else {
      console.log(message);
    }
  }

  child(name: string): LoggerApi {
    return this;
  }

  isLogEnabled(logLevel: LogLevel): boolean {
    return this.logLevel >= logLevel;
  }
}
