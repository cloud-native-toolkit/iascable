// @ts-ignore
import {Observable, Subject} from 'rxjs';
import {Container} from 'typescript-ioc';
import {load} from 'js-yaml';

import {CatalogBuilderApi, CatalogBuilderParams, CatalogBuilderResult} from './catalog-builder.api';
import {
  BillOfMaterialEntry,
  catalogApiV2Version, CatalogInputModel,
  catalogKind,
  Module,
  ModuleIdAlias,
  ModuleProvider, ModuleTemplate, moduleWithCategory
} from '../../models';
import {LoggerApi} from '../../util/logger';
import {loadFile} from '../../util/file-util';
import {flatten} from '../../util/array-util';

interface CatalogBuilder {
  providersSubject: Subject<ModuleProvider>
  aliasesSubject: Subject<ModuleIdAlias>
  modulesSubject: Subject<Module>
  bomsSubject: Subject<BillOfMaterialEntry>
  complete: () => void
}

class CatalogBuilderResultValue implements CatalogBuilderResult, CatalogBuilder {
  kind: string = catalogKind
  apiVersion: string = catalogApiV2Version

  _providers: Subject<ModuleProvider>
  _aliases: Subject<ModuleIdAlias>
  _modules: Subject<Module>
  _boms: Subject<BillOfMaterialEntry>

  constructor() {
    this._providers = new Subject<ModuleProvider>()
    this._aliases = new Subject<ModuleIdAlias>()
    this._modules = new Subject<Module>()
    this._boms = new Subject<BillOfMaterialEntry>()
  }

  get providers(): Observable<ModuleProvider> {
    return this._providers
  }
  get aliases(): Observable<ModuleIdAlias> {
    return this._aliases
  }
  get modules(): Observable<Module> {
    return this._modules
  }
  get boms(): Observable<BillOfMaterialEntry> {
    return this._boms
  }

  get providersSubject(): Subject<ModuleProvider> {
    return this._providers
  }
  get aliasesSubject(): Subject<ModuleIdAlias> {
    return this._aliases
  }
  get modulesSubject(): Subject<Module> {
    return this._modules
  }
  get bomsSubject(): Subject<BillOfMaterialEntry> {
    return this._boms
  }

  complete() {
    this._providers.complete()
    this._aliases.complete()
    this._modules.complete()
    this._boms.complete()
  }
}

export class CatalogBuilderService implements CatalogBuilderApi {
  build(params: CatalogBuilderParams): CatalogBuilderResult {

    const result = new CatalogBuilderResultValue()

    const logger: LoggerApi = Container.get(LoggerApi)

    if (params.catalogInput) {
      this.handleCatalogInput(result, {catalogInput: params.catalogInput})
        .catch(err => logger.debug(`Error loading catalog input: ${params.catalogInput}`, err))
    } else if (params.moduleMetadataUrl) {
      this.handleModuleMetadataUrl(result, Object.assign({}, params, {moduleMetadataUrl: params.moduleMetadataUrl}))
        .catch(err => logger.debug(`Error loading module metadata: ${params.moduleMetadataUrl}`, err))
    } else {
      throw new Error('catalogInput or moduleMetadataUrl are required')
    }

    return result
  }

  async handleModuleMetadataUrl(result: CatalogBuilder, {moduleMetadataUrl, category}: {moduleMetadataUrl: string, category: string}): Promise<void> {
    try {
      const moduleContent: Buffer | string = await loadFile(moduleMetadataUrl)

      const module = load(moduleContent.toString()) as Module

      const moduleWithCategory: Module = Object.assign(module, {category})

      result.modulesSubject.next(moduleWithCategory)

      result.complete()
    } catch (err) {
      result.modulesSubject.error(err)
      result.complete()
    }
  }

  async handleCatalogInput(result: CatalogBuilder, {catalogInput}: {catalogInput: string}): Promise<void> {
    try {
      const catalogInputContent: Buffer | string = await loadFile(catalogInput)

      const input = load(catalogInputContent.toString()) as CatalogInputModel

      applyAllToSubject(result.aliasesSubject, input.aliases);
      applyAllToSubject(result.providersSubject, input.providers);

      const modules: Array<Promise<Module | undefined>> = (input.categories || [])
        .map(category => category.modules.map(moduleWithCategory(category.category)))
        .reduce(flatten, [])
        .map(lookupModuleMetadata)
        .map((value: Promise<Module | undefined>) => value.then(module => {
          if (module) {
            result.modulesSubject.next(module)
          }

          return module
        }))

      await Promise.all(modules)

      result.complete()
    } catch (err) {
      result.modulesSubject.error(err)
      result.complete()
    }
  }
}

const applyAllToSubject = <T>(subject: Subject<T>, input: T[] = []): Subject<T> => {
  input.forEach(applyAll(subject))

  return subject
}

const applyAll = <T>(subject: Subject<T>) => {
  return (value: T) => subject.next(value)
}

const lookupModuleMetadata = async (moduleTemplate: ModuleTemplate): Promise<Module | undefined> => {
  const logger: LoggerApi = Container.get(LoggerApi)

  let moduleMetadataUrl: string = ''
  try {
    moduleMetadataUrl = getModuleMetadataUrl(moduleTemplate)

    const moduleMetadataContent: Buffer | string = await loadFile(moduleMetadataUrl)

    const module: Module = load(moduleMetadataContent.toString()) as Module

    return Object.assign(
      module,
      moduleTemplate,
      {
        id: module.id,
        name: module.name,
        displayName: moduleTemplate.displayName || moduleTemplate.name
      })
  } catch (err) {
    logger.warn(`Error retrieving module metadata: ${moduleMetadataUrl || moduleTemplate.id}`)

    return
  }
}

const getModuleMetadataUrl = (module: ModuleTemplate) => {
  if (module.metadataUrl) {
    return module.metadataUrl
  }

  const githubSlugRegEx = new RegExp('.*github.com/([^/]+)/(.*)')

  const match = githubSlugRegEx.exec(module.id)
  if (!match) {
    throw new Error(`Unable to determine github slug from id: ${module.id}`)
  }

  const org = match[1]
  const repo = match[2]

  return `https://${org}.github.io/${repo}/index.yaml`
}
