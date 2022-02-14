import {LoggerApi} from '../util/logger';
import {Container} from 'typescript-ioc';
import {Module, ModuleDependency, ModuleProvider, ModuleVariable} from './module.model';
import {BillOfMaterialModule} from './bill-of-material.model';
import {of as ofArray} from '../util/array-util';
import {Optional} from '../util/optional';
import {findMatchingVersions} from '../util/version-resolver';

export interface CatalogCategoryModel {
  category: string;
  selection: 'required' | 'single' | 'indirect' | 'multiple';
  modules: Module[];
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

export interface CatalogModel {
  categories: CatalogCategoryModel[];
  providers?: CatalogProviderModel[];
}

export interface CatalogFilter {
  platform?: string;
  provider?: string;
  modules?: BillOfMaterialModule[];
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

export function isCatalog(model: Catalog | CatalogModel): model is Catalog {
  return !!model && (typeof (model as Catalog).filter === 'function');
}

export class Catalog implements CatalogModel {
  private logger: LoggerApi;

  public readonly categories: CatalogCategoryModel[];
  public readonly providers: CatalogProviderModel[];
  public readonly filterValue?: {platform?: string, provider?: string};

  constructor(values: CatalogModel, filterValue?: {platform?: string, provider?: string}) {
    this.categories = values.categories;
    this.providers = values.providers || []
    this.filterValue = filterValue;

    this.logger = Container.get(LoggerApi).child('Catalog');
  }

  static fromModel(model: CatalogModel): Catalog {
    if (isCatalog(model)) {
      return model;
    }

    return new Catalog(model);
  }

  get modules(): Module[] {
    return this.categories.reduce((result: Module[], current: CatalogCategoryModel) => {
      if ((current.modules || []).length > 0) {
        result.push(...current.modules);
      }

      return result;
    }, [])
  }

  filter({platform, provider, modules}: CatalogFilter | undefined = {}): Catalog {
    this.logger.debug('Filtering catalog modules to match filter values', {filter: {platform, provider}});

    const filteredCategories: CatalogCategoryModel[] = this.categories
      .map((category: CatalogCategoryModel) => {
        const filteredModules = (category.modules || [])
          .filter(matchingPlatforms(platform))
          .filter(matchingProviders(provider))
          .filter(matchingModules(modules))
          .map(matchingModuleVersions(modules));

        return Object.assign({}, category, {modules: filteredModules});
      })
      .filter((category: CatalogCategoryModel) => (category.modules.length > 0))

    return new Catalog({categories: filteredCategories}, {platform, provider});
  }

  lookupProvider(provider: ModuleProvider): Optional<CatalogProviderModel> {

    return ofArray(this.providers)
      .filter((p: CatalogProviderModel) => {
        const result = p.name === provider.name && p.source === provider.source

        return result
      })
      .first()
  }

  lookupModule(moduleId: {id: string, name?: string} | {name: string, id?: string}): Module | undefined {
    this.logger.debug('Looking up module from catalog: ', {moduleId, modules: this.modules})

    const result: Module | undefined = ofArray(this.modules)
      .filter(m => {
        const match: boolean = idsMatch(m, moduleId) || m.name === moduleId.name

        this.logger.debug(`  Matched module: ${match}`, {moduleId, module: m})

        return match
      })
      .first()
      .orElse(undefined as any);

    this.logger.debug('  Found matching module: ', {result})

    return result
  }

  findModulesWithInterface(interfaceId: string): Module[] {
    return this.modules.filter(m => (m.interfaces || []).includes(interfaceId))
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

const idsMatch = (a: {id?: string}, b: {id?: string}): boolean => {

  return cleanId(a.id) === cleanId(b.id)
}

const cleanId = (id?: string): string => {
  return (id || '').replace(/[.]git$/g, '')
}
