import {Container} from 'typescript-ioc';
import {CatalogLoaderApi} from './catalog-loader.api';
import {CatalogLoader} from './catalog-loader.impl';

export * from './catalog-loader.api';
export * from './catalog-loader.impl';

Container.bind(CatalogLoaderApi).to(CatalogLoader);
