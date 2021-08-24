import {VersionMatcher} from './version-matcher';
import {BillOfMaterialModule} from './bill-of-material.model';
import {isUndefined} from '../util/object-util';
import {ArrayUtil, of as arrayOf} from '../util/array-util';
import {Optional} from '../util/optional';

export interface ModuleProvider {
  name: string;
  alias?: string;
  source?: string;
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
  aliasIds?: string[];
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

export function isSingleModuleVersion(module: Module | SingleModuleVersion): module is SingleModuleVersion {
  return !!module && !!(module as SingleModuleVersion).version;
}

export interface ModuleDependency {
  id: string;
  refs: ModuleRef[];
  optional?: boolean;
  discriminator?: string;
}

export interface ModuleVersion {
  version: string;
  dependencies?: ModuleDependency[];
  variables: ModuleVariable[];
  outputs: ModuleOutput[];
  providers?: ModuleProvider[];
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
    .reduce((result: ModuleRef[], current: ModuleRef[]) => {
      result.push(...current);

      return result;
    }, []);

  return dependencyRefs.some((ref: ModuleRef) => ref.source === depModule.id);
}

export type WrappedModule = Module & {dependsOn: (module: Module | undefined) => boolean};

export function wrapModule(module: Module | undefined): WrappedModule {
  const dependsOn = (depModule: Module | undefined): boolean => {
    if (isUndefined(module)) {
      return false;
    }

    return dependsOnModule(module, depModule);
  }

  return Object.assign({versions: [], name: ''}, module, {dependsOn})
}
