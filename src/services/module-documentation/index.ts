import {Container} from 'typescript-ioc';
import {ModuleDocumentationApi} from './module-documentation.api';
import {ModuleDocumentation} from './module-documentation';

export * from './module-documentation.api'

Container.bind(ModuleDocumentationApi).to(ModuleDocumentation);
