import {VersionMatcher} from './version-matcher';
import {BillOfMaterialModule} from './bill-of-material.model';
import {isUndefined} from '../util/object-util';
import {ArrayUtil, of as arrayOf} from '../util/array-util';
import {Optional} from '../util/optional';
import {CatalogProviderModel} from './catalog.model';

export interface ModuleProvider {
  name: string;
  alias?: string;
  source?: string;
  variables?: ModuleVariable[];
  dependencies?: ModuleDependency[];
}

export interface ModuleRef {
  source: string;
  version?: string;
}

export interface ModuleMatcher {
  source: string;
  version: VersionMatcher[];
}

export interface ModuleTemplate {
  id: string;
  name: string;
  alias?: string;
  default?: boolean;
  originalAlias?: string;
  aliasIds?: string[];
  interfaces?: string[];
  category: string;
  description?: string;
  platforms: string[];
  provider?: 'ibm' | 'k8s';
  providers?: ModuleProvider[];
  tags?: string[];
  ibmCatalogId?: string;
  fsReady?: string;
  documentation?: string;
}

export interface Module extends ModuleTemplate {
  versions: ModuleVersion[];
  bomModule?: BillOfMaterialModule;
}

export function isModule(module: Module | ModuleRef): module is Module {
  return !!module && !!(module as Module).id;
}

export function isModuleRef(module: Module | ModuleRef): module is ModuleRef {
  return !!module && !!(module as ModuleRef).source;
}

export interface SingleModuleVersion extends ModuleTemplate {
  version: ModuleVersion;
  bomModule?: BillOfMaterialModule;
}

export function isSingleModuleVersion(module: any): module is SingleModuleVersion {
  return !!module && !!(module as SingleModuleVersion).version;
}

export interface ModuleDependency {
  id: string;
  preferred?: string;
  refs?: ModuleRef[];
  interface?: string;
  optional?: boolean;
  discriminator?: string;
  manualResolution?: boolean;
  _module?: Module | Module[];
}

export interface ModuleVersion {
  version: string;
  dependencies?: ModuleDependency[];
  variables: ModuleVariable[];
  outputs: ModuleOutput[];
  providers?: Array<ModuleProvider | CatalogProviderModel>;
}

export interface ModuleVariable {
  name: string;
  type: string;
  alias?: string;
  scope?: 'module' | 'global' | 'ignore';
  description?: string;
  optional?: boolean;
  default?: string;
  defaultValue?: string;
  moduleRef?: ModuleOutputRef;
  mapper?: 'equality' | 'collect';
  important?: boolean;
}

export interface ModuleOutputRef {
  id: string;
  output: string;
}

export interface ModuleOutput {
  name: string;
  description?: string;
}

export function dependsOnModule(module: Module, depModule: Module | undefined): boolean {
  if (isUndefined(depModule)) {
    return false;
  }

  const moduleVersion: Optional<ModuleVersion> = arrayOf(module.versions).first();
  if (!moduleVersion.isPresent()) {
    return false;
  }

  const moduleDependencies: ArrayUtil<ModuleDependency> = arrayOf(moduleVersion.get().dependencies);

  if (moduleDependencies.some(d => d.discriminator === '*')) {
    return true;
  }

  const dependencyRefs: ModuleRef[] = moduleDependencies
    .map(d => d.refs)
    .reduce((result: ModuleRef[], current: ModuleRef[] | undefined) => {
      if (current) {
        result.push(...current);
      }

      return result;
    }, []);

  return dependencyRefs.some((ref: ModuleRef) => ref.source === depModule.id);
}

export type ModuleWithDependsOn = Module & {dependsOn: (module: Module | undefined) => boolean};

export function injectDependsOnFunction(module: Module | undefined): ModuleWithDependsOn {
  const dependsOn = (depModule: Module | undefined): boolean => {
    if (isUndefined(module)) {
      return false;
    }

    return dependsOnModule(module, depModule);
  }

  return Object.assign({versions: [], name: ''}, module, {dependsOn})
}
