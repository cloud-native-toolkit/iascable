import { dirname, resolve } from 'path'
import { Container } from 'typescript-ioc'
import { JSON_SCHEMA, load } from 'js-yaml'
import uniqBy from 'lodash.uniqby'
import uniqWith from 'lodash.uniqwith'

import {
  BillOfMaterialEntry,
  catalogApiV2Version,
  catalogKind,
  CatalogLoaderApi,
  CatalogModel,
  CatalogV2Metadata,
  CatalogV2Model,
  getFlattenedModules,
  isBomKind,
  isCatalogKind,
  isCatalogV2Model,
  isSolutionKind,
  ModuleIdAlias
} from './catalog-loader.api'
import {
  CustomResourceDefinition,
  getAnnotation,
  isModule,
  isSolution,
  Module,
  ProviderModel,
  Solution
} from '../../models'
import { BillOfMaterial, Catalog } from '../../model-impls'
import { ArrayUtil, loadFile, LoggerApi } from '../../util'

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

    catalog.providers.forEach((p: ProviderModel) => {
      p.dependencies = p.dependencies || []
      p.variables = p.variables || []
    })

    return catalog
  }

  async loadCatalogYaml(catalogUrls: string[]): Promise<CatalogV2Model> {

    const catalogYamls: Array<{content: string | Buffer, url: string}> = await Promise.all(catalogUrls.map(async url => ({content: await loadFile(url), url})))

    return catalogYamls.reduce((result: CatalogV2Model, current: {content: string | Buffer, url: string}) => {
      const inputYaml: CustomResourceDefinition = this.parseYaml(current.content.toString())

      const newModel: CatalogModel = isCatalogKind(inputYaml)
        ? inputYaml
        : isBomKind(inputYaml)
          ? catalogFromBom(inputYaml)
          : isSolutionKind(inputYaml)
            ? catalogFromSolution(inputYaml)
            : catalogFromModule(inputYaml, current.url)

      return mergeCatalogs(result, newModel)
    }, {} as any)
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

        const mergedAlises = uniqBy((current.aliases || []).concat(result.aliases || []), 'id')
        const providers = uniqBy((current.providers || []).concat(result.providers || []), 'name')
        const {modules, aliases} = mergeModules(getFlattenedModules(current), result.modules || [], mergedAlises)
        const boms: BillOfMaterialEntry[] = uniqBy(getBoms(current).concat(result.boms || []), 'name')
        const metadata:CatalogV2Metadata = {
          name: 'Merged Catalog',
          ...result.metadata,
          ...current.metadata,
          cloudProviders: uniqBy((isCatalogV2Model(current)? current.metadata?.cloudProviders ?? [] : []).concat(result.metadata?.cloudProviders ?? []), 'name'),
          flavors: uniqBy((isCatalogV2Model(current)? current.metadata?.flavors ?? [] : []).concat(result.metadata?.flavors ?? []), 'name'),
          useCases: uniqBy((isCatalogV2Model(current)? current.metadata?.useCases ?? [] : []).concat(result.metadata?.useCases ?? []), 'name'),
        };
        return {kind: catalogKind, apiVersion: catalogApiV2Version, aliases, providers, modules, boms, metadata}
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

const catalogUrlToPath = (catalogUrl: string): string => {
  return resolve(dirname(catalogUrl));
}

const catalogFromModule = (inputYaml: CustomResourceDefinition, catalogUrl: string): CatalogV2Model => {
  const modules: Module[] = []

  if (isModule(inputYaml)) {
    const id = inputYaml.id || catalogUrlToPath(catalogUrl)

    modules.push(Object.assign({}, inputYaml, {category: 'other', id}))
  }

  return {kind: catalogKind, apiVersion: catalogApiV2Version, modules, boms: []}
}

const catalogFromBom = (inputYaml: CustomResourceDefinition): CatalogV2Model => {
  const boms: BillOfMaterialEntry[] = []

  if (isBomKind(inputYaml)) {
    boms.push(buildBillOfMaterialEntry(inputYaml))
  }

  return {kind: catalogKind, apiVersion: catalogApiV2Version, modules: [], boms}
}

const catalogFromSolution = (inputYaml: CustomResourceDefinition): CatalogV2Model => {
  const boms: BillOfMaterialEntry[] = []

  if (isSolution(inputYaml)) {
    boms.push(buildBillOfMaterialEntry(inputYaml))
  }

  return {kind: catalogKind, apiVersion: catalogApiV2Version, modules: [], boms}
}

const mergeModules = (newModules: Module[], baseModules: Module[], aliases: ModuleIdAlias[] = []): {modules: Module[], aliases: ModuleIdAlias[]} => {

  const modules = uniqWith(newModules.concat(baseModules), (a: Module, b: Module) => {
    const match = a.name === b.name

    if (match) {
      ArrayUtil.of(aliases)
        .filter(alias => alias.id === a.id)
        .first()
        .map<ModuleIdAlias>(alias => Object.assign(alias, {id: b.id, aliases: alias.aliases.concat([a.id])}))
        .orElseGet(() => {
          const newAlias = {
            id: b.id,
            aliases: [a.id]
          }

          aliases.push(newAlias)

          return newAlias
        })
    }

    return match
  })

  return {modules, aliases: aliases}
}

const buildBillOfMaterialEntry = (bom: BillOfMaterial | Solution): BillOfMaterialEntry => {

  return {
    name: bom.metadata.name,
    displayName: getAnnotation(bom, 'displayName') || bom.metadata.name,
    description: getAnnotation(bom, 'description') || '',
    tags: [],
    category: 'other',
    type: isBomKind(bom) ? 'bom' : 'solution',
    versions: [{
      version: bom.spec.version || 'v1.0.0',
      content: bom
    }]
  };
}
