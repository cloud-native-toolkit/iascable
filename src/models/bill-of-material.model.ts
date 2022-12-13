import {KubernetesResource} from './crd.model';
import {of} from '../util';

export interface BillOfMaterialModuleDependency {
  name?: string;
  id?: string;
  ref: string;
  optional?: boolean;
}

export interface BillOfMaterialModuleVariable {
  name: string;
  value?: any;
  description?: string;
  alias?: string;
  scope?: string;
  required?: boolean;
  sensitive?: boolean;
}

export interface BillOfMaterialModuleOutput {
  name: string;
  description?: string;
  alias?: string;
  scope?: string;
}

export interface BillOfMaterialModuleProvider {
  name: string;
  ref?: string;
}

export interface BaseBillOfMaterialModule {
  alias?: string;
  version?: string;
  default?: boolean;
  variables?: BillOfMaterialModuleVariable[];
  outputs?: BillOfMaterialModuleOutput[];
  dependencies?: BillOfMaterialModuleDependency[];
  providers?: BillOfMaterialModuleProvider[];
}

export interface BillOfMaterialModuleById extends BaseBillOfMaterialModule {
  id: string;
  name?: string;
}

export interface BillOfMaterialModuleByName extends BaseBillOfMaterialModule {
  name: string;
  id?: string;
}

export type BillOfMaterialModule = BillOfMaterialModuleById | BillOfMaterialModuleByName;

export function isBillOfMaterialModule(module: any): module is BillOfMaterialModule {
  return !!module && (!!(module as BillOfMaterialModule).id || !!(module as BillOfMaterialModule).name);
}

export function isBillOfMaterialModuleById(module: string | BillOfMaterialModule): module is BillOfMaterialModuleById {
  return !!module && !!(module as BillOfMaterialModule).id;
}

export function isBillOfMaterialModuleByName(module: string | BillOfMaterialModule): module is BillOfMaterialModuleByName {
  return !!module && !!(module as BillOfMaterialModule).name;
}

export interface BillOfMaterialVariable {
  name: string;
  description?: string;
  ref?: string;
  value?: string;
  alias?: string;
  required?: boolean;
  sensitive?: boolean;
}

export interface BillOfMaterialOutput {
  name: string;
  alias?: string;
}

export interface BillOfMaterialProvider {
  name: string;
  alias?: string;
  source?: string;
  variables?: BillOfMaterialProviderVariable[];
}

export interface BillOfMaterialProviderVariable {
  name: string;
  alias: string;
  scope: string;
}

export interface BillOfMaterialSpec {
  version?: string;
  modules: Array<string | BillOfMaterialModule>;
  variables?: BillOfMaterialVariable[];
  outputs?: BillOfMaterialOutput[];
  providers?: BillOfMaterialProvider[];
}

export interface BillOfMaterialModel extends KubernetesResource<BillOfMaterialSpec> {
}

export function isBillOfMaterialModel(value: any): value is BillOfMaterialModel {
  return of<BillOfMaterialModel>(value)
    .map(m => m.spec)
    .map(s => s.modules)
    .isPresent()
}
