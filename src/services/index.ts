import {Container} from 'typescript-ioc';
import {IascableApi} from './iascable.api';
import {CatalogBuilder} from './iascable.impl';

export * from './iascable.api';
export * from './iascable.impl';
export * from './catalog-loader';
export * from './module-selector';
export * from './terraform-builder';
export * from './tile-builder';
export * from './bill-of-material-builder';

Container.bind(IascableApi).to(CatalogBuilder);
