import {Container} from 'typescript-ioc';
import {promises} from 'fs';
import {Response} from 'superagent';
import {JSON_SCHEMA, load} from 'js-yaml';

import * as superagent from 'superagent';

import {Catalog, CatalogLoaderApi} from './catalog-loader.api';
import {LoggerApi} from '../../util/logger';

export class CatalogLoader implements CatalogLoaderApi {

  private logger: LoggerApi;

  constructor() {
    this.logger = Container.get(LoggerApi).child('CatalogLoaderImpl');
  }

  async loadCatalog(catalogUrl: string): Promise<Catalog> {
    this.logger.info('Loading catalog from url: ' + catalogUrl);

    const catalogYaml: string = catalogUrl.startsWith('file:/')
      ? await this.loadCatalogFromFile(catalogUrl.replace('file:/', ''))
      : await this.loadCatalogFromUrl(catalogUrl);

    return new Catalog(this.parseYaml(catalogYaml));
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
