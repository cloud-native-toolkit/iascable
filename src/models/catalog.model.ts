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
import {CustomResourceDefinition, ResourceMetadata} from './crd.model';
import {SolutionModel} from './solution.model';
import {BillOfMaterialNotFound, BillOfMaterialVersionNotFound} from '../errors';
import {flatten} from '../util/array-util';
import {ArrayUtil, of as ofArray} from '../util/array-util/array-util';
import {Optional} from '../util/optional';
import {findMatchingVersions} from '../util/version-resolver';
import {loadBillOfMaterialFromFile} from '../util/bill-of-material-builder';

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
  subCategory?: string;
  iconUrl?: string;
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

export function matchingPlatforms(platform?: string): (m: Module) => boolean {
  return (m: Module) => !m.platforms || !platform || m.platforms.includes(platform);
}

export function matchingProviders(provider?: string): (m: Module) => boolean {
  return (m: Module) => !provider || provider === 'ibm' || determineModuleProvider(m) !== 'ibm';
}

export function matchingModules(modules?: BillOfMaterialModule[]): (m: Module) => boolean {
  return (m: Module) => {
    return !modules || modules.some(module => (module.id === m.id || module.name === m.name));
  };
}

export function matchingModuleVersions(modules?: BillOfMaterialModule[]): (m: Module) => Module {
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

export const cleanId = (id?: string): string => {
  return (id || '')
    .replace(/[.]git$/g, '')
    .replace(/^https?:\/\//, '')
}

export interface ModuleIdAlias {
  id: string
  aliases: string[]
}

export interface DenormalizedModuleIdAliases {
  [aliasId: string]: string
}
