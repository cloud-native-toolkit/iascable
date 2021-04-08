
export abstract class LoggerApi {
  abstract info(message: string, ...context: any[]): void;
  abstract debug(message: string, ...context: any[]): void;
  abstract error(message: string, ...context: any[]): void;
  abstract warn(message: string, ...context: any[]): void;
  abstract child(name: string): LoggerApi;
}
