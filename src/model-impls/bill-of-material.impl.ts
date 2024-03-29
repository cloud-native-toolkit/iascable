import {default as jsYaml} from 'js-yaml';

import {ResourceMetadata} from '../models/crd.model';
import {of, Optional, arrayOf} from '../util';
import {
  BillOfMaterialModel,
  BillOfMaterialModule,
  BillOfMaterialSpec,
  isSingleModuleVersion,
  isBillOfMaterialModule,
  isBillOfMaterialModuleById,
  isBillOfMaterialModuleByName, SingleModuleVersion, Module, isBillOfMaterialModel, OutputFile,
} from '../models';
import {isSolutionModel, Solution, SolutionModel} from '../models/solution.model';
import {BillOfMaterialParsingError} from '../errors';

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
    const modulesOrIds: Array<string | BillOfMaterialModule> = of<BillOfMaterialModel>(model)
      .map(m => m.spec)
      .map(s => s.modules)
      .orElse([]);

    return modulesOrIds
      .map(m => isBillOfMaterialModule(m) ? m : {id: m});
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

  getName(): string {
    return this.metadata.name;
  }

  getDescription(): string {
    const description: Optional<string> = arrayOf(Object.keys(this.metadata.annotations || {}))
      .filter(key => key === 'description')
      .first();

    return description.orElse(`${this.getName()} bill of material`);
  }
}

export function billOfMaterialFromYaml(bomYaml: string | Buffer, name?: string): BillOfMaterialModel | SolutionModel {
  if (!bomYaml) {
    throw new Error(`BOM yaml not provided: ${name}`)
  }
  try {
    const content: any = jsYaml.load(bomYaml.toString());
    if (isBillOfMaterialModel(content)) {
      return new BillOfMaterial(content, name);
    } else if (isSolutionModel(content)) {
      return new Solution(content, name);
    }
  } catch (err) {
    throw new BillOfMaterialParsingError(bomYaml.toString());
  }

  throw new Error('Yaml is not a BOM or SolutionBOM model');
}

export class BillOfMaterialFile implements OutputFile {
  constructor(private model: BillOfMaterialModel, public readonly name: string = 'bom.yaml') {
  }

  contents(): Promise<string | Buffer> {
    return Promise.resolve(jsYaml.dump(this.model))
  }
}
