import {BillOfMaterialModule} from './bill-of-material.model';
import {CustomResourceDefinition, ResourceMetadata} from './crd.model';
import {ModuleTemplate, ProviderModel, VersionedModule} from './module.model';
import {findMatchingVersions, flatten, arrayOf, Optional} from '../util';
import { BillOfMaterial } from '../model-impls'
import { Solution } from './solution.model'
import { CapabilityModel } from './capability.model'

export interface CatalogCategoryModel<M = VersionedModule> {
  category: string;
  categoryName?: string;
  selection: 'required' | 'single' | 'indirect' | 'multiple';
  modules: M[];
}

export interface CatalogInputModel extends CustomResourceDefinition {
  categories: CatalogCategoryModel<ModuleTemplate>[];
  providers?: ProviderModel[];
  aliases?: ModuleIdAlias[];
}

export interface BillOfMaterialVersion {
  version: string;
  metadataUrl?: string;
  content?: BillOfMaterial | Solution;
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
  modules: VersionedModule[];
  providers?: ProviderModel[];
  aliases?: ModuleIdAlias[];
  boms: BillOfMaterialEntry[];
  metadata?: CatalogV2Metadata;
  capabilities?: CapabilityModel[];
}

export interface CatalogV1Model extends CustomResourceDefinition {
  categories: CatalogCategoryModel[];
  providers?: ProviderModel[];
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

function determineModuleProvider(module: VersionedModule) {
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

export function isBomKind(crd: CustomResourceDefinition): crd is BillOfMaterial {
  return !!crd && crd.kind === 'BillOfMaterial'
}

export function isSolutionKind(crd: CustomResourceDefinition): crd is Solution {
  return !!crd && crd.kind === 'Solution'
}

export const isCatalogV1Model = (catalog: CatalogV1Model | CatalogV2Model): catalog is CatalogV1Model => {
  return !!catalog && catalog.apiVersion === catalogApiV1Version
}

export const isCatalogV2Model = (catalog: CatalogV1Model | CatalogV2Model): catalog is CatalogV2Model => {
  return !!catalog && catalog.apiVersion === catalogApiV2Version
}

export type CatalogModel = CatalogV1Model | CatalogV2Model

export const getFlattenedModules = (input: CatalogModel): VersionedModule[] => {
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

export function matchingPlatforms(platform?: string): (m: VersionedModule) => boolean {
  return (m: VersionedModule) => !m.platforms || !platform || m.platforms.includes(platform);
}

export function matchingProviders(provider?: string): (m: VersionedModule) => boolean {
  return (m: VersionedModule) => !provider || provider === 'ibm' || determineModuleProvider(m) !== 'ibm';
}

export function matchingModules(modules?: BillOfMaterialModule[]): (m: VersionedModule) => boolean {
  return (m: VersionedModule) => {
    return !modules || modules.some(module => (module.id === m.id || module.name === m.name));
  };
}

export function matchingModuleVersions(modules?: BillOfMaterialModule[]): (m: VersionedModule) => VersionedModule {
  return (m: VersionedModule): VersionedModule => {
    const versionMatcher: Optional<string> = arrayOf<BillOfMaterialModule>(modules)
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
