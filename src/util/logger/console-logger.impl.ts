import {LoggerApi} from './logger.api';
import {isDefinedAndNotNull, isUndefined} from '../object-util/object-util';
import {ObjectFactory} from 'typescript-ioc';

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

const isSomeEnum = <T>(e: T) => (token: any): token is T[keyof T] =>
  Object.values(e as any).includes(token as T[keyof T]);

const isLogLevel = isSomeEnum(LogLevel);

export const logLevelFromString = (logLevel?: string | LogLevel, defaultLogLevel: LogLevel = LogLevel.INFO): LogLevel => {
  if (isLogLevel(logLevel)) {
    return logLevel;
  }

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
  private component: string;

  constructor(logLevel: string | LogLevel | undefined = process.env.LOG_LEVEL, component: string | undefined) {
    this.logLevel = logLevelFromString(logLevel);

    this.component = component ? `${component}: ` : '';
  }

  debug(message: string, context?: any): void {
    if (!this.isLogEnabled(LogLevel.DEBUG)) return;

    this.log(message, context);
  }

  msg(message: string, context?: any): void {
    if (!this.isLogEnabled(LogLevel.ERROR)) return;

    if (context) {
      console.log(message, context);
    } else {
      console.log(message);
    }
  }

  error(message: string, context?: any): void {
    if (!this.isLogEnabled(LogLevel.ERROR)) return;

    if (context) {
      console.error(this.component + message, context);
    } else {
      console.error(this.component + message);
    }
  }

  info(message: string, context?: any): void {
    if (!this.isLogEnabled(LogLevel.INFO)) return;

    this.log(message, context);
  }

  warn(message: string, context?: any): void {
    if (!this.isLogEnabled(LogLevel.WARN)) return;

    this.log(message, context);
  }

  log(message: string, context?: any) {
    if (context) {
      console.log(this.component + message, context);
    } else {
      console.log(this.component + message);
    }

  }

  child(name: string): LoggerApi {
    return new ConsoleLogger(this.logLevel, name);
  }

  isLogEnabled(logLevel: LogLevel): boolean {
    return this.logLevel >= logLevel;
  }
}

export const consoleLoggerFactory = (logLevel: LogLevel): ObjectFactory => {
  return () => new ConsoleLogger(logLevel, undefined)
}
