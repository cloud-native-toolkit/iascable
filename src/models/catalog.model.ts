import {LoggerApi} from '../util/logger';
import {Container} from 'typescript-ioc';
import cloneDeep from 'lodash.clonedeep';

import {
  Module,
  ModuleDependency,
  ModuleProvider,
  ModuleTemplate,
  ModuleVariable
} from './module.model';
import {BillOfMaterialModel, BillOfMaterialModule} from './bill-of-material.model';
import {ArrayUtil, of as ofArray} from '../util/array-util/array-util';
import {Optional} from '../util/optional';
import {findMatchingVersions} from '../util/version-resolver';
import {CustomResourceDefinition, ResourceMetadata} from './crd.model';
import {flatten} from '../util/array-util';
import {BillOfMaterialNotFound, BillOfMaterialVersionNotFound} from '../errors';
import {loadBillOfMaterialFromFile} from '../services';
import {SolutionModel} from './solution.model';

export interface CatalogCategoryModel<M = Module> {
  category: string;
  categoryName?: string;
  selection: 'required' | 'single' | 'indirect' | 'multiple';
  modules: M[];
}

export interface CatalogProviderModel {
  name: string;
  source?: string;
  alias?: string;
  dependencies: ModuleDependency[];
  variables: ModuleVariable[];
}

export const isCatalogProviderModel = (value: any): value is CatalogProviderModel => {
  return !!value && !!(value as CatalogProviderModel).dependencies && !!(value as CatalogProviderModel).variables
}

export interface CatalogInputModel extends CustomResourceDefinition {
  categories: CatalogCategoryModel<ModuleTemplate>[];
  providers?: CatalogProviderModel[];
  aliases?: ModuleIdAlias[];
}

export interface BillOfMaterialVersion {
  version: string;
  metadataUrl: string;
}

export interface BillOfMaterialEntry {
  name: string;
  displayName: string;
  description: string;
  tags: string[];
  category: string;
  subCategory: string;
  iconUrl: string;
  type: string;
  cloudProvider?: string;
  versions: BillOfMaterialVersion[];
}

export interface CatalogV2Model extends CustomResourceDefinition {
  modules: Module[];
  providers?: CatalogProviderModel[];
  aliases?: ModuleIdAlias[];
  boms: BillOfMaterialEntry[];
  metadata?: CatalogV2Metadata;
}

export interface CatalogV1Model extends CustomResourceDefinition {
  categories: CatalogCategoryModel[];
  providers?: CatalogProviderModel[];
  aliases?: ModuleIdAlias[];
}

export interface CatalogFilter {
  platform?: string;
  provider?: string;
  modules?: BillOfMaterialModule[];
}

export interface CatalogV2MetadataItem {
  name: string;
  displayName: string;
  description: string;
  iconUrl: string;
}

export interface UseCaseMetadata extends CatalogV2MetadataItem {
  flavor: string;
}
export interface CloudProviderMetadata extends CatalogV2MetadataItem {}
export interface FlavorMetadata extends CatalogV2MetadataItem {}
export interface UseCaseMetadata extends CatalogV2MetadataItem {
  flavor: string;
}

export interface CatalogV2Metadata extends ResourceMetadata {
  cloudProviders?: CloudProviderMetadata[]
  useCases?: UseCaseMetadata[]
  flavors?: FlavorMetadata[]
}

function determineModuleProvider(module: Module) {
  if (module.provider) {
    return module.provider;
  }

  const regex = new RegExp('.*terraform-([^-]+)-.*', 'ig');
  if (regex.test(module.id)) {
    return module.id.replace(regex, "$1");
  }

  return '';
}

export function isCatalog(model: Catalog | CatalogV1Model | CatalogV2Model): model is Catalog {
  return !!model && (typeof (model as Catalog).filter === 'function');
}

export function isCatalogKind(crd: CustomResourceDefinition): crd is CatalogV1Model | CatalogV2Model {
  return !!crd && crd.kind === 'Catalog'
}

export const isCatalogV1Model = (catalog: CatalogV1Model | CatalogV2Model): catalog is CatalogV1Model => {
  return !!catalog && catalog.apiVersion === catalogApiV1Version
}

export const isCatalogV2Model = (catalog: CatalogV1Model | CatalogV2Model): catalog is CatalogV2Model => {
  return !!catalog && catalog.apiVersion === catalogApiV2Version
}

export type CatalogModel = CatalogV1Model | CatalogV2Model

export const getFlattenedModules = (input: CatalogModel): Module[] => {
  if (isCatalogV2Model(input)) {
    return (input.modules || [])
  }

  return (input.categories || [])
    .map((category: CatalogCategoryModel) => (category.modules || []).map(moduleWithCategory(category.category)))
    .reduce(flatten, [])
}

export const moduleWithCategory = (category: string) => {
  return <T extends ModuleTemplate>(module: T) => Object.assign({}, module, {category})
}

export const catalogApiV1Version: string = 'cloudnativetoolkit.dev/v1alpha1';
export const catalogApiV2Version: string = 'cloudnativetoolkit.dev/v2';
export const catalogKind: string = 'Catalog';
export const catalogSummaryKind: string = 'CatalogSummary';

export class Catalog implements CatalogV2Model {
  private logger: LoggerApi;

  public readonly apiVersion: string = catalogApiV2Version;
  public readonly kind: string = catalogKind;
  public readonly metadata?: CatalogV2Metadata;
  public readonly modules: Module[];
  public readonly providers: CatalogProviderModel[];
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

  lookupProvider(provider: ModuleProvider): Optional<CatalogProviderModel> {
    return ofArray(this.providers)
      .filter((p: CatalogProviderModel) => p.name === provider.name && p.source === provider.source)
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

    const result: Module | undefined = ofArray(this.modules)
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

function matchingPlatforms(platform?: string): (m: Module) => boolean {
  return (m: Module) => !m.platforms || !platform || m.platforms.includes(platform);
}

function matchingProviders(provider?: string): (m: Module) => boolean {
  return (m: Module) => !provider || provider === 'ibm' || determineModuleProvider(m) !== 'ibm';
}

function matchingModules(modules?: BillOfMaterialModule[]): (m: Module) => boolean {
  return (m: Module) => {
    return !modules || modules.some(module => (module.id === m.id || module.name === m.name));
  };
}

function matchingModuleVersions(modules?: BillOfMaterialModule[]): (m: Module) => Module {
  return (m: Module): Module => {
    const versionMatcher: Optional<string> = ofArray<BillOfMaterialModule>(modules)
      .filter(module => module.id === m.id || module.name === m.name)
      .first()
      .map<string>(module => module.version as any);

    if (!versionMatcher.isPresent()) {
      return m;
    }

    const versions = findMatchingVersions(m, versionMatcher.get());

    return Object.assign({}, m, {versions});
  }
}

const cleanId = (id?: string): string => {
  return (id || '')
    .replace(/[.]git$/g, '')
    .replace(/^https?:\/\//, '')
}

export interface ModuleIdAlias {
  id: string
  aliases: string[]
}

interface DenormalizedModuleIdAliases {
  [aliasId: string]: string
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
