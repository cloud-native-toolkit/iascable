import {BillOfMaterialModule} from './bill-of-material.model';
import {CustomResourceDefinition} from './crd.model';
import {VersionMatcher} from './version-matcher';
import {arrayOf, ArrayUtil, isUndefined, Optional} from '../util';

export interface ProviderModel {
  name: string;
  alias?: string;
  source?: string;
  dependencies?: ModuleDependency[];
  variables?: ModuleVariable[];
}

export const isProviderModel = (value: any): value is ProviderModel => {
  return !!value && !!(value as ProviderModel).dependencies && !!(value as ProviderModel).variables
}

export interface ModuleRef {
  source: string;
  version?: string;
}

export interface ModuleMatcher {
  source: string;
  version: VersionMatcher[];
}

export interface ModuleTemplate extends CustomResourceDefinition {
  id: string;
  registryId?: string;
  name: string;
  displayName?: string;
  idAliases?: string[];
  alias?: string;
  default?: boolean;
  originalAlias?: string;
  aliasIds?: string[];
  interfaces?: string[];
  category: string;
  description?: string;
  platforms: string[];
  provider?: 'ibm' | 'k8s';
  providers?: ProviderModel[];
  tags?: string[];
  ibmCatalogId?: string;
  fsReady?: string;
  documentation?: string;
  examplePath?: string;
  license?: string;
  group?: string;
  cloudProvider?: string;
  softwareProvider?: string;
  metadataUrl?: string;
}

export interface ModuleSummary extends ModuleTemplate {
  versions: Array<{version: string}>;
}

export interface VersionedModule extends ModuleTemplate {
  versions: ModuleVersion[];
}

export interface BaseSingleModuleVersion extends ModuleTemplate {
  version: ModuleVersion;
}

export function isBaseSingleModuleVersion(module: any): module is BaseSingleModuleVersion {
  return !!module && !!(module as BaseSingleModuleVersion).version;
}

export interface ModuleDependency {
  id: string;
  preferred?: string;
  refs?: ModuleRef[];
  interface?: string;
  optional?: boolean;
  discriminator?: string;
  manualResolution?: boolean;
  _module?: VersionedModule | VersionedModule[];
}

export interface ModuleVersion {
  version: string;
  dependencies?: ModuleDependency[];
  variables: ModuleVariable[];
  outputs: ModuleOutput[];
  providers?: Array<ProviderModel>;
  terraformVersion?: string;
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
  sensitive?: boolean;
}

export interface ModuleOutput {
  name: string
  description?: string
  sensitive?: boolean
}

export interface ModuleOutputRef {
  id: string;
  output: string;
}

export function dependsOnModule(module: VersionedModule, depModule: VersionedModule | undefined): boolean {
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

export type ModuleWithDependsOn = VersionedModule & {dependsOn: (module: VersionedModule | undefined) => boolean};

export function injectDependsOnFunction(module: VersionedModule | undefined): ModuleWithDependsOn {
  const dependsOn = (depModule: VersionedModule | undefined): boolean => {
    if (isUndefined(module)) {
      return false;
    }

    return dependsOnModule(module, depModule);
  }

  return Object.assign({versions: [], name: ''}, module, {dependsOn})
}

export interface ModuleInterfaceModel {
  id: string
  name: string
  variables?: ModuleVariable[]
  outputs?: ModuleOutput[]
}

export interface Module extends VersionedModule {
  bomModule?: BillOfMaterialModule;
}

export function isModule(module: Module | ModuleRef | CustomResourceDefinition): module is Module {
  return !!module && !!(module as Module).name && !!(module as Module).versions;
}

export function isModuleRef(module: Module | ModuleRef | CustomResourceDefinition): module is ModuleRef {
  return !!module && !!(module as ModuleRef).source;
}

export interface SingleModuleVersion extends BaseSingleModuleVersion {
  bomModule?: BillOfMaterialModule;
}

export function isSingleModuleVersion(module: any): module is SingleModuleVersion {
  return !!module && !!(module as SingleModuleVersion).version;
}
