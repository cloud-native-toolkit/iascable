import cloneDeep from 'lodash.clonedeep';
import {Container} from 'typescript-ioc';

import {
  BillOfMaterialEntry,
  BillOfMaterialModel,
  BillOfMaterialVersion,
  catalogApiV2Version,
  CatalogFilter,
  catalogKind,
  CatalogV1Model,
  CatalogV2Metadata,
  CatalogV2Model,
  cleanId,
  DenormalizedModuleIdAliases,
  getFlattenedModules,
  isCatalogV2Model,
  matchingModules,
  matchingModuleVersions,
  matchingPlatforms,
  matchingProviders,
  Module,
  ModuleIdAlias,
  ProviderModel,
  SolutionModel
} from '../models';
import {BillOfMaterialNotFound, BillOfMaterialVersionNotFound} from '../errors';
import {arrayOf, ArrayUtil, loadBillOfMaterialFromFile, LoggerApi, Optional} from '../util';

export class Catalog implements CatalogV2Model {
  private logger: LoggerApi;

  public readonly apiVersion: string = catalogApiV2Version;
  public readonly kind: string = catalogKind;
  public readonly metadata?: CatalogV2Metadata;
  public readonly modules: Module[];
  public readonly providers: ProviderModel[];
  public readonly filterValue?: {platform?: string, provider?: string};
  public readonly flattenedAliases: DenormalizedModuleIdAliases;
  public readonly moduleIdAliases: ModuleIdAlias[];
  public readonly boms: BillOfMaterialEntry[];

  constructor(values: CatalogV1Model | CatalogV2Model, filterValue?: {platform?: string, provider?: string}) {
    this.modules = getFlattenedModules(values)
    this.providers = values.providers || []
    this.filterValue = filterValue;
    this.boms = isCatalogV2Model(values) ? values.boms : []

    this.moduleIdAliases = values.aliases || [];
    this.flattenedAliases = denormalizeModuleIdAliases(values.aliases);
    this.metadata = values.metadata;

    this.logger = Container.get(LoggerApi).child('Catalog');
  }

  static fromModel(model: CatalogV1Model | CatalogV2Model): Catalog {
    if (isCatalog(model)) {
      return model;
    }

    return new Catalog(model);
  }

  filter({platform, provider, modules}: CatalogFilter | undefined = {}): Catalog {
    this.logger.debug('Filtering catalog modules to match filter values', {filter: {platform, provider}});

    const filteredModules: Module[] = this.modules
      .filter((module: Module) => {
        const result = [module]
          .filter(matchingPlatforms(platform))
          .filter(matchingProviders(provider))
          .filter(matchingModules(modules))
          .map(matchingModuleVersions(modules));

        return result.length > 0;
      })

    return new Catalog({apiVersion: catalogApiV2Version, kind: catalogKind, modules: filteredModules, boms: this.boms}, {platform, provider});
  }

  lookupProvider(provider: ProviderModel): Optional<ProviderModel> {
    return arrayOf(this.providers)
      .filter((p: ProviderModel) => p.name === provider.name && p.source === provider.source)
      .first()
      .map(p => cloneDeep(p))
  }

  async lookupBOM({name, version}: {name: string, version?: string}): Promise<BillOfMaterialModel | SolutionModel | undefined> {
    const bomEntry: BillOfMaterialEntry = ArrayUtil.of(this.boms)
      .filter(bom => bom.name === name)
      .first()
      .orElseThrow(new BillOfMaterialNotFound(name, this.boms))

    const bomVersion: BillOfMaterialVersion = ArrayUtil.of(bomEntry.versions)
      .filter((v: BillOfMaterialVersion) => !version || (version === v.version))
      .first()
      .orElseThrow(new BillOfMaterialVersionNotFound(name, version));

    return loadBillOfMaterialFromFile(bomVersion.metadataUrl)
  }

  lookupModule(moduleId: {id: string, name?: string} | {name: string, id?: string}): Module | undefined {
    this.logger.debug('Looking up module from catalog: ', {moduleId, modules: this.modules})

    const result: Module | undefined = arrayOf(this.modules)
      .filter(m => {
        const match: boolean = this.idsMatch(m, moduleId) || m.name === moduleId.name

        this.logger.debug(`  Matched module: ${match}`, {moduleId, module: m})

        return match
      })
      .first()
      .map(m => Object.assign({}, m))
      .orElse(undefined as any);

    this.logger.debug('  Found matching module: ', {result})

    return cloneDeep(result)
  }

  findModulesWithInterface(interfaceId: string): Module[] {
    return this.modules.filter(m => (m.interfaces || []).includes(interfaceId))
  }

  getModuleId(moduleId: string): string {
    const cleanedId = cleanId(moduleId)

    return this.flattenedAliases[cleanedId] || cleanedId
  }

  idsMatch(a: {id?: string}, b: {id?: string}): boolean {
    const aId = this.getModuleId(a.id || '')
    const bId = this.getModuleId(b.id || '')

    return aId === bId
  }

}

const denormalizeModuleIdAliases = (aliases: ModuleIdAlias[] = []): DenormalizedModuleIdAliases => {
  return aliases
    .map(moduleIdAliasToDenormalizedModuleAlias)
    .reduce(
      (result: DenormalizedModuleIdAliases, current: DenormalizedModuleIdAliases) => {
        return Object.assign(result, current)
      },
      {})
}

const moduleIdAliasToDenormalizedModuleAlias = (moduleAlias: ModuleIdAlias): DenormalizedModuleIdAliases => {
  return moduleAlias.aliases.reduce(
    (result: DenormalizedModuleIdAliases, currentAlias: string) => {
      result[currentAlias] = moduleAlias.id

      return result
    },
    {})
}

export function isCatalog(model: Catalog | CatalogV1Model | CatalogV2Model): model is Catalog {
  return !!model && (typeof (model as Catalog).filter === 'function');
}
