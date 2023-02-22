import {Catalog} from '../../model-impls';

export * from '../../models/catalog.model';

export abstract class CatalogLoaderApi {
  abstract loadCatalog(catalogUrl: string | string[]): Promise<Catalog>;
}
