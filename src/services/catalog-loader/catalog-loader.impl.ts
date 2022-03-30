import {Container} from 'typescript-ioc';
import {promises} from 'fs';
import {default as superagent, Response} from 'superagent';
import {JSON_SCHEMA, load} from 'js-yaml';

import {Catalog, CatalogLoaderApi, CatalogProviderModel} from './catalog-loader.api';
import {LoggerApi} from '../../util/logger';

export class CatalogLoader implements CatalogLoaderApi {

  private logger: LoggerApi;

  constructor() {
    this.logger = Container.get(LoggerApi).child('CatalogLoaderImpl');
  }

  async loadCatalog(catalogUrl: string): Promise<Catalog> {
    this.logger.msg('Loading catalog from url: ' + catalogUrl);

    const catalogYaml: string = catalogUrl.startsWith('file:/')
      ? await this.loadCatalogFromFile(catalogUrl.replace('file:/', ''))
      : await this.loadCatalogFromUrl(catalogUrl);

    const catalog = new Catalog(this.parseYaml(catalogYaml));

    catalog.providers.forEach((p: CatalogProviderModel) => {
      p.dependencies = p.dependencies || []
      p.variables = p.variables || []
    })

    return catalog
  }

  async loadCatalogFromFile(fileName: string): Promise<string> {
    const catalogYaml = await promises.readFile(fileName);

    return catalogYaml.toString();
  }

  async loadCatalogFromUrl(catalogUrl: string): Promise<string> {
    const response: Response = await superagent.get(catalogUrl);

    return response.text;
  }

  parseYaml<T>(text: string): T {
    return load(
      text,
      {
        json: true,
        schema: JSON_SCHEMA,
      }
    ) as any;
  }
}
