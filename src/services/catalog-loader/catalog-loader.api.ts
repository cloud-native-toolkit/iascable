import {Catalog} from '../../model-impls/catalog.impl';

export * from '../../models/catalog.model';

export abstract class CatalogLoaderApi {
  abstract loadCatalog(catalogUrl: string | string[]): Promise<Catalog>;
}
