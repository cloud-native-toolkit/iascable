export * from './iascable';
export * from './bom-documentation';
export * from './catalog-builder';
export * from './catalog-loader';
export * from './dependency-graph';
export * from './module-documentation';
export * from './module-metadata-service';
export * from './module-selector';
export * from './terraform-builder';
export * from './tile-builder';

import {Container} from 'typescript-ioc';
import iocConfig from './ioc.config'

Container.configure(...iocConfig)
