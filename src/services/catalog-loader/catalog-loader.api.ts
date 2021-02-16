import {Catalog} from '../../models/catalog.model';

export * from '../../models/catalog.model';

export abstract class CatalogLoaderApi {
  abstract loadCatalog(catalogUrl: string): Promise<Catalog>;
}
