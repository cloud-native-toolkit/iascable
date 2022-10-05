import {Container} from 'typescript-ioc';
import {CatalogBuilderApi} from './catalog-builder.api';
import {CatalogBuilderService} from './catalog-builder-service';

export * from './catalog-builder.api'

Container.bind(CatalogBuilderApi).to(CatalogBuilderService)
