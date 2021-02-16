import {Container} from 'typescript-ioc';
import {ConsoleLogger} from './console-logger.impl';
import {LoggerApi} from './logger.api';

export * from './logger.api';

Container.bind(LoggerApi).to(ConsoleLogger);
