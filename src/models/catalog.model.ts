import {LoggerApi} from '../util/logger';
import {Container} from 'typescript-ioc';
import {Module} from './module.model';
import {BillOfMaterialModule} from './bill-of-material.model';
import {of as ofArray} from '../util/array-util';
import {Optional} from '../util/optional';
import {findMatchingVersions} from '../util/version-resolver';

export interface CatalogCategoryModel {
  category: string;
  selection: 'required' | 'single' | 'indirect' | 'multiple';
  modules: Module[];
}

export interface CatalogModel {
  categories: CatalogCategoryModel[];
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
  public readonly filterValue?: {platform?: string, provider?: string};

  constructor(values: CatalogModel, filterValue?: {platform?: string, provider?: string}) {
    this.categories = values.categories;
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

  lookupModule(moduleId: {id: string, name?: string} | {name: string, id?: string}): Module | undefined {
    return ofArray(this.modules)
      .filter(m => m.id === moduleId.id || m.name === moduleId.name)
      .first()
      .orElse(undefined as any);
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
