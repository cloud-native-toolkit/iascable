import {Container} from 'typescript-ioc';
import {promises} from 'fs';
import {default as superagent, Response} from 'superagent';
import {JSON_SCHEMA, load} from 'js-yaml';
import _ from 'lodash';

import {
  BillOfMaterialEntry,
  Catalog,
  catalogApiV2Version,
  catalogKind,
  CatalogLoaderApi,
  CatalogModel,
  CatalogProviderModel,
  CatalogV2Model,
  getFlattenedModules,
  isCatalogKind, isCatalogV2Model
} from './catalog-loader.api';
import {LoggerApi} from '../../util/logger';
import {isModule, Module} from '../../models';
import {CustomResourceDefinition} from '../../models/crd.model';

export class CatalogLoader implements CatalogLoaderApi {

  private logger: LoggerApi;

  constructor() {
    this.logger = Container.get(LoggerApi).child('CatalogLoaderImpl');
  }

  async loadCatalog(catalogUrlInput: string | string[]): Promise<Catalog> {
    const catalogUrls: string[] = Array.isArray(catalogUrlInput) ? catalogUrlInput : [catalogUrlInput]

    this.logger.msg('Loading catalog from url(s): ' + catalogUrls);

    const catalogModel: CatalogV2Model = await this.loadCatalogYaml(catalogUrls);

    const catalog = new Catalog(catalogModel);

    catalog.providers.forEach((p: CatalogProviderModel) => {
      p.dependencies = p.dependencies || []
      p.variables = p.variables || []
    })

    return catalog
  }

  async loadCatalogYaml(catalogUrls: string[]): Promise<CatalogV2Model> {

    const catalogYamls: string[] = await Promise.all(catalogUrls.map(catalogUrl => catalogUrl.startsWith('file:/')
      ? this.loadCatalogFromFile(catalogUrl.replace('file:', ''))
      : this.loadCatalogFromUrl(catalogUrl)
    ))

    return catalogYamls.reduce((result: CatalogV2Model, current: string) => {
      const inputYaml: CustomResourceDefinition = this.parseYaml(current)

      const newModel: CatalogModel = isCatalogKind(inputYaml) ? inputYaml : catalogFromModule(inputYaml)

      return mergeCatalogs(result, newModel)
    }, {} as any)
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

const mergeCatalogs = (baseCatalog: CatalogModel, newCatalog: CatalogModel): CatalogV2Model => {

  return [baseCatalog, newCatalog]
    .reduce(
      (result: CatalogV2Model, current: CatalogModel) => {

        const aliases = _.uniqBy((current.aliases || []).concat(result.aliases || []), 'id')
        const providers = _.uniqBy((current.providers || []).concat(result.providers || []), 'name')
        const modules = _.uniqBy(getFlattenedModules(current).concat(result.modules || []), 'name')
        const boms = _.uniqBy(getBoms(current).concat(result.boms || []), 'name')

        return {kind: catalogKind, apiVersion: catalogApiV2Version, aliases, providers, modules, boms}
      },
      {} as CatalogV2Model
    )
}

const getBoms = (catalog: CatalogModel): BillOfMaterialEntry[] => {
  if (!isCatalogV2Model(catalog)) {
    return []
  }

  return catalog.boms || []
}

const catalogFromModule = (inputYaml: CustomResourceDefinition): CatalogV2Model => {
  const modules: Module[] = []

  if (isModule(inputYaml)) {
    modules.push(Object.assign({}, inputYaml, {category: 'other'}))
  }

  return {kind: catalogKind, apiVersion: catalogApiV2Version, modules, boms: []}
}
