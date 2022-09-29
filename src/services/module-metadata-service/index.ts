import {Container} from 'typescript-ioc';
import {ModuleMetadataApi} from './module-metadata.api';
import {ModuleMetadataService} from './module-metadata-service';

export * from './module-metadata.api'

Container.bind(ModuleMetadataApi).to(ModuleMetadataService)
