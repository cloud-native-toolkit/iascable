import {
  BillOfMaterialModule, BillOfMaterialModuleByName,
  BillOfMaterialVariable,
  ModuleDependency,
  ModuleOutput,
  ModuleProvider,
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
  providers: ModuleProvider[]
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

export interface BomTemplateModel {
  name: string
  description: string
  documentation?: string
  diagram?: string
  vpn?: boolean
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

  protected constructor(public name: string, public type: OutputFileType, private templateFile: string) {
    this._engine = new Liquid()
  }

  abstract get model(): Promise<object>;

  template(): Promise<string> {
    return promises.readFile(this.templateFile).then(buf => buf.toString())
  }

  get contents(): Promise<string | Buffer> {
    return new Promise(async (resolve, reject) => {
      try {
        const result = await this._engine.parseAndRender(await this.template(), await this.model)

        resolve(result)
      } catch (err) {
        reject(err)
      }
    })
  }

}
