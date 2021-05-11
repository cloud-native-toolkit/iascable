import {LoggerApi} from './logger.api';

export class NoopLoggerImpl implements LoggerApi {
  child(name: string): LoggerApi {
    return this;
  }

  msg(message: string, context?: any): void {
  }

  debug(message: string, context?: any): void {
  }

  error(message: string, context?: any): void {
  }

  info(message: string, context?: any): void {
  }

  warn(message: string, context?: any): void {
  }
}
