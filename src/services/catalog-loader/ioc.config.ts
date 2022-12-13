import {CatalogLoaderApi} from './catalog-loader.api';
import {CatalogLoader} from './catalog-loader.impl';

export default [
  {bind: CatalogLoaderApi, to: CatalogLoader}
]
