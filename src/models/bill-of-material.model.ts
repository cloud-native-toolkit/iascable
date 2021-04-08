import {isSingleModuleVersion, Module, SingleModuleVersion} from './module.model';
import {of} from '../util/optional';

export interface BillOfMaterialModuleDependency {
  name: string;
  ref: string;
}

export interface BillOfMaterialModuleVariable {
  name: string;
  value: any;
}

export interface BaseBillOfMaterialModule {
  alias?: string;
  version?: string;
  variables?: BillOfMaterialModuleVariable[];
  dependencies?: BillOfMaterialModuleDependency[];
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

export function isBillOfMaterialModule(module: string | BillOfMaterialModule): module is BillOfMaterialModule {
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
  value: string;
}

export interface BillOfMaterialSpec {
  modules: Array<string | BillOfMaterialModule>;
  variables?: BillOfMaterialVariable[];
}

export interface ResourceMetadata {
  name: string;
  labels?: any;
  annotations?: any;
}

export interface KubernetesResource<T = any> {
  apiVersion: string;
  kind: string;
  metadata: ResourceMetadata;
  spec: T;
}

export interface BillOfMaterialModel extends KubernetesResource<BillOfMaterialSpec> {
}

export function isBillOfMaterialModel(value: any): value is BillOfMaterialModel {
  return of<BillOfMaterialModel>(value)
    .map(m => m.spec)
    .map(s => s.modules)
    .isPresent()
}

export class BillOfMaterial implements BillOfMaterialModel {
  apiVersion = 'cloud.ibm.com/v1alpha1';
  kind = 'BillOfMaterial';
  metadata: ResourceMetadata = {
    name: 'default'
  };
  spec: BillOfMaterialSpec = {
    modules: [],
    variables: [],
  };

  static getModuleRefs(model?: BillOfMaterialModel): BillOfMaterialModule[] {
    const modules: Array<string | BillOfMaterialModule> = of<BillOfMaterialModel>(model)
      .map(m => m.spec)
      .map(s => s.modules)
      .orElse([]);

    return modules.map((module: string | BillOfMaterialModule) => isBillOfMaterialModuleById(module) ? {id: module.id} : isBillOfMaterialModuleByName(module) ? {name: module.name} : {id: module})
  }

  static getModules(model?: BillOfMaterialModel): BillOfMaterialModule[] {
    const modules: Array<string | BillOfMaterialModule> = of<BillOfMaterialModel>(model)
      .map(m => m.spec)
      .map(s => s.modules)
      .orElse([]);

    return modules.map(m => isBillOfMaterialModule(m) ? m : {id: m});
  }

  constructor(nameOrValue: string | Partial<BillOfMaterialModel> = {}, name?: string) {
    if (typeof nameOrValue === 'string') {
      this.metadata = {
        name: nameOrValue
      };
    } else {
      const metadata = Object.assign({}, nameOrValue.metadata, name ? {name} : {name: nameOrValue.metadata?.name || 'component'});

      Object.assign(this, nameOrValue, {metadata});
    }
  }

  addModules(...modules: Array<Module | SingleModuleVersion>): BillOfMaterial {

    const newModules = modules.reduce(
        (result: Array<string | BillOfMaterialModule>, module: Module | SingleModuleVersion) => {
          if (!result.some(m => (isBillOfMaterialModule(m) ? m.id : m) === module.id)) {
            if (isSingleModuleVersion(module)) {
              result.push({id: module.id, version: module.version.version});
            } else {
              result.push(module.id);
            }
          }

          return result;
        },
        this.spec.modules
      );

    const newSpec: BillOfMaterialSpec = Object.assign({}, this.spec, {modules: newModules});

    return Object.assign({}, this, {spec: newSpec});
  }
}
