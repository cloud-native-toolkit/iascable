import {
  BillOfMaterialModule, BillOfMaterialModuleByName,
  BillOfMaterialVariable,
  ModuleDependency,
  ModuleOutput,
  ProviderModel,
  ModuleVariable, OutputFile, OutputFileType
} from '../models';
import {SolutionLayerModel, SolutionVariableModel} from '../models/solution.model';
import {join} from 'path';
import {promises} from 'fs';
import {Liquid} from 'liquidjs';

export interface PrintableVariable {
  name: string
  description: string
  required: boolean
  defaultValue?: string
  source?: string
}

export interface ModuleReadmeTemplate {
  name: string
  description: string
  documentation?: string
  terraformVersion: string
  providers: ProviderModel[]
  dependencies: ModuleDependency[]
  examplePath?: string
  example: string
  variables: PrintableVariable[]
  outputs: ModuleOutput[]
  license: string
  iascableVersion: string
}

export interface PrintableBillOfMaterialModule extends BillOfMaterialModuleByName {
  url?: string;
}

export interface LayerDependency {
  name: string
  path: string
}

export interface BomTemplateModel {
  name: string
  description: string
  documentation?: string
  diagram?: string
  vpn?: boolean
  dependencies: LayerDependency[]
  variables: BillOfMaterialVariable[]
  modules: PrintableBillOfMaterialModule[]
}

export interface SolutionTemplateModel {
  name: string
  description: string
  documentation?: string
  diagram?: string
  vpn?: boolean
  variables: SolutionVariableModel[]
  stack: SolutionLayerModel[]
}

export abstract class TemplatedFile implements OutputFile {
  _engine: Liquid;
  _templateFile: string;

  protected constructor(public name: string, public type: OutputFileType, templateFile: string) {
    this._engine = new Liquid()
    this._templateFile = templateFile
  }

  abstract get model(): Promise<object>;

  templateFile(options?: any): string {
    return this._templateFile
  }

  template(options?: any): Promise<string> {
    return promises.readFile(this.templateFile(options)).then(buf => buf.toString())
  }

  contents(options?: any): Promise<string | Buffer> {
    return new Promise(async (resolve, reject) => {
      try {
        const result = await this._engine.parseAndRender(await this.template(options), await this.model)

        resolve(result)
      } catch (err) {
        reject(err)
      }
    })
  }

}
