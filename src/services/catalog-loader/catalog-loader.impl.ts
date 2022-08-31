import {Container} from 'typescript-ioc';
import {promises} from 'fs';
import {default as superagent, Response} from 'superagent';
import {JSON_SCHEMA, load} from 'js-yaml';
import _ from 'lodash';

import {
  Catalog, CatalogCategoryModel,
  CatalogLoaderApi, CatalogModel,
  CatalogProviderModel
} from './catalog-loader.api';
import {LoggerApi} from '../../util/logger';
import first from '../../util/first';
import {Module} from '../../models';

export class CatalogLoader implements CatalogLoaderApi {

  private logger: LoggerApi;

  constructor() {
    this.logger = Container.get(LoggerApi).child('CatalogLoaderImpl');
  }

  async loadCatalog(catalogUrlInput: string | string[]): Promise<Catalog> {
    const catalogUrls: string[] = Array.isArray(catalogUrlInput) ? catalogUrlInput : [catalogUrlInput]

    this.logger.msg('Loading catalog from url(s): ' + catalogUrls);

    const catalogModel: CatalogModel = await this.loadCatalogYaml(catalogUrls);

    const catalog = new Catalog(catalogModel);

    catalog.providers.forEach((p: CatalogProviderModel) => {
      p.dependencies = p.dependencies || []
      p.variables = p.variables || []
    })

    return catalog
  }

  async loadCatalogYaml(catalogUrls: string[]): Promise<CatalogModel> {

    const catalogYamls: string[] = await Promise.all(catalogUrls.map(catalogUrl => catalogUrl.startsWith('file:/')
      ? this.loadCatalogFromFile(catalogUrl.replace('file:/', ''))
      : this.loadCatalogFromUrl(catalogUrl)
    ))

    return catalogYamls.reduce((result: CatalogModel, current: string) => {
      const newModel: CatalogModel = this.parseYaml(current) as CatalogModel

      return mergeCatalogs(newModel, result)
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

const mergeCatalogs = (baseCatalog: CatalogModel, newCatalog: CatalogModel): CatalogModel => {
  const keys: Array<keyof CatalogModel> = ['aliases','categories','providers']

  return [baseCatalog, newCatalog]
    .reduce(
      (result: CatalogModel, current: CatalogModel) => {

        const aliases = _.uniqBy((current.aliases || []).concat(result.aliases || []), 'id')
        const providers = _.uniqBy((current.providers || []).concat(result.providers || []), 'name')
        const categories = mergeCategories(current.categories || [], result.categories || [])

        return {aliases, providers, categories}
      },
      {} as CatalogModel
    )
}

const mergeCategories = (baseCategories: CatalogCategoryModel[], newCategories: CatalogCategoryModel[]): CatalogCategoryModel[] => {
  return baseCategories.reduce((result: CatalogCategoryModel[], current: CatalogCategoryModel) => {
    const match = first(result.filter(category => category.category === current.category))

    if (match.isPresent()) {
      const matchCategory = match.get();

      matchCategory.modules = mergeCategoryModules(matchCategory.modules || [], current.modules || [])
    } else {
      // this is a new category, add it to the list
      result.push(current)
    }

    return result
  }, newCategories)
}

const mergeCategoryModules = (baseModules: Module[], newModules: Module[]): Module[] => {
  return _.uniqBy(newModules.concat(baseModules), 'name')
}
