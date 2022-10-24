import {dump} from 'js-yaml';
import cloneDeep from 'lodash.clonedeep';
import unionBy from 'lodash.unionby';

import {KubernetesResource, ResourceMetadata} from './crd.model';
import {catalogApiV2Version} from './catalog.model';
import {OutputFile, OutputFileType} from './file.model';
import {BillOfMaterialVariable} from './bill-of-material.model';
import {isDefined} from '../util/object-util';
import {TerraformComponent, TerraformComponentModel} from './stages.model';

const kindSolution = 'Solution'

export interface SolutionFileModel {
  name: string
  type: string
  content?: string
  contentUrl?: string
}

export interface SolutionVariableModel {
  name: string
  description?: string
  value?: string;
  alias?: string;
  required?: boolean;
  sensitive?: boolean;
}

export interface SolutionLayerModel {
  name: string
  layer: string
  description: string
  version?: string
}

export interface SolutionSpecModel {
  version: string
  stack: SolutionLayerModel[]
  variables: SolutionVariableModel[]
  files: SolutionFileModel[]
}

export interface SolutionModel extends KubernetesResource<SolutionSpecModel> {
}

export const isSolutionModel = (model: any): model is SolutionModel => {
  const solutionModel: SolutionModel = model

  return !!solutionModel && solutionModel.apiVersion === catalogApiV2Version && solutionModel.kind === kindSolution
}

export class Solution implements SolutionModel {
  public readonly apiVersion = catalogApiV2Version
  public readonly kind = kindSolution
  public readonly metadata: ResourceMetadata

  public readonly spec: SolutionSpecModel

  readonly original: SolutionModel;
  _terraform: TerraformComponent[] = []

  readonly marker: string = 'solution'

  constructor(model: SolutionModel, name: string = 'solution') {
    this.metadata = cloneDeep(model.metadata || {name})
    this.spec = cloneDeep(model.spec)

    this.original = model
  }

  static fromModel(model: SolutionModel): Solution {
    if (isSolution(model)) {
      return model
    }

    return new Solution(model)
  }

  get terraform(): TerraformComponent[] {
    return this._terraform
  }
  set terraform(terraform: TerraformComponent[]) {
    this._terraform = terraform

    // merge variables into solution
    this.spec.variables = this._terraform
      .map(getTerraformVariables)
      .reduce(
        (result: BillOfMaterialVariable[], current: BillOfMaterialVariable[]) => unionBy(current, result, 'name'),
        this.spec.variables || []
      )
      .sort((a, b): number => {
        let result = sortUndefined(a.value, b.value)

        if (result === 0) {
          result = a.name.localeCompare(b.name)
        }

        return result
      })
  }

  get name(): string {
    return this.metadata?.name || 'solution'
  }

  get version(): string {
    return this.spec?.version
  }

  get stack(): SolutionLayerModel[] {
    return this.spec?.stack
  }

  get variables(): SolutionVariableModel[] {
    return this.spec?.variables
  }

  get files(): SolutionFileModel[] {
    return this.spec?.files
  }

  asFile(): OutputFile {
    return new SolutionBomFile(this)
  }

  asString(): string {
    return dump({
      apiVersion: this.apiVersion,
      kind: this.kind,
      metadata: this.metadata,
      spec: this.spec,
    })
  }
}

export const isSolution = (model: any): model is Solution => {
  return !!model && (model.marker === 'solution')
}

export class SolutionBomFile implements OutputFile {
  name: string;
  type: OutputFileType = OutputFileType.documentation;
  _solution: Solution;

  constructor(solution: Solution, name: string = 'bom.yaml') {
    this._solution = solution
    this.name = name
  }

  contents(): Promise<string | Buffer> {
    return Promise.resolve(this._solution.asString())
  }
}

const getTerraformVariables = (terraformComponent: TerraformComponentModel): BillOfMaterialVariable[] => {

  const terragruntInputNames: string[] = (terraformComponent.terragrunt?.inputs || []).map(input => input.name)
  const bomVariables: BillOfMaterialVariable[] = terraformComponent.billOfMaterial?.spec.variables || []

  return bomVariables.filter(variable => {
    const result = !terragruntInputNames.includes(variable.name)

    return result
  })
}

const sortUndefined = (a: any, b: any): number => {
  if ((isDefined(a) && isDefined(b)) || (!isDefined(a) && !isDefined(b))) {
    return 0
  } else if (!isDefined(a)) {
    return -1
  } else {
    return 1
  }
}
