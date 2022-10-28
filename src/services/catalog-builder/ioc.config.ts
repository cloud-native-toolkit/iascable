import {CatalogBuilderApi} from './catalog-builder.api';
import {CatalogBuilderService} from './catalog-builder-service';

export default [
  {bind: CatalogBuilderApi, to: CatalogBuilderService}
]
