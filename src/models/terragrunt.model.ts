import {OutputFile, OutputFileType} from './file.model';
import {BillOfMaterialModel} from './bill-of-material.model';
import {getAnnotation, getAnnotationList, getMetadataName} from './crd.model';
import {of as arrayOf} from '../util/array-util';
import {Optional} from '../util/optional';

export interface TerragruntLayerModel {
  currentBom: BillOfMaterialModel
  boms: BillOfMaterialModel[]
  inputs: TerragruntInputModel[]
  dependencies: TerragruntDependencyModel[]
}

export interface TerragruntInputModel {
  name: string
  dependency: TerragruntDependencyModel
  output: string
}

export interface TerragruntDependencyModel {
  name: string
  path: string
  outputs: string[]
}

export class TerragruntLayer implements TerragruntLayerModel, OutputFile {
  name: string = 'terragrunt.hcl';
  type: OutputFileType = OutputFileType.terraform;

  currentBom: BillOfMaterialModel
  boms: BillOfMaterialModel[]

  inputs: TerragruntInputModel[] = []
  dependencies: TerragruntDependencyModel[] = []

  constructor({currentBom, boms = []}: {currentBom: BillOfMaterialModel, boms?: BillOfMaterialModel[]}) {
    this.currentBom = currentBom
    this.boms = boms

    this.processDependencies()
  }

  processDependencies() {
    const needs: string[] = getAnnotationList(this.currentBom, 'dependencies.cloudnativetoolkit.dev/needs')
    if (needs.length === 0) {
      return ''
    }

    const addInput = (input: TerragruntInputModel): TerragruntInputModel => {
      input.dependency.outputs.push(input.output)

      this.inputs.push(input)

      return input
    }

    needs
      .forEach(need => {
        const bom: Optional<BillOfMaterialModel> = this.findMatchingDependency(need)

        // TODO lookup input and output variables from bom/module
        if (bom.isPresent()) {
          const needBom: BillOfMaterialModel = bom.get()

          if (need === 'cluster') {
            const depPrefix = 'cluster'

            const dependency: TerragruntDependencyModel = {
              name: 'cluster',
              path: getMetadataName(needBom, 'cluster'),
              outputs: [],
            }

            this.dependencies.push(dependency)

            // TODO include ca_cert and kubeconfig variables (requires module changes)
            addInput({name: 'server_url', dependency, output: `${depPrefix}_server_url`})
            addInput({name: 'cluster_login_user', dependency, output: `${depPrefix}_username`})
            addInput({name: 'cluster_login_password', dependency, output: `${depPrefix}_password`})
            addInput({name: 'cluster_login_token', dependency, output: `${depPrefix}_token`})
          } else if (need === 'gitops') {
            const depPrefix = 'gitops_repo_config'

            const dependency: TerragruntDependencyModel = {
              name: 'gitops',
              path: getMetadataName(needBom, 'gitops'),
              outputs: [],
            }

            this.dependencies.push(dependency)

            addInput({name: 'gitops_repo_host', dependency, output: `${depPrefix}_host`})
            addInput({name: 'gitops_repo_org', dependency, output: `${depPrefix}_org`})
            addInput({name: 'gitops_repo_repo', dependency, output: `${depPrefix}_name`})
            addInput({name: 'gitops_repo_project', dependency, output: `${depPrefix}_project`})
            addInput({name: 'gitops_repo_username', dependency, output: `${depPrefix}_username`})
            addInput({name: 'gitops_repo_token', dependency, output: `${depPrefix}_token`})
          } else if (need === 'storage') {
            this.dependencies.push({
              name: 'storage',
              path: getMetadataName(needBom, 'storage'),
              outputs: [],
            })
          }
        }
      })
  }

  findMatchingDependency(need: string): Optional<BillOfMaterialModel> {
    return arrayOf(this.boms)
      .filter(bom => {
        const provides = getAnnotationList(bom, 'dependencies.cloudnativetoolkit.dev/provides')

        return provides.includes(need)
      })
      .first()
  }

  contents(options?: {flatten?: boolean}): Promise<string | Buffer> {
    return Promise.resolve(`
include "root" {
  path = find_in_parent_folders()
}

${this.terraformBlock()}

${this.dependencyBlocks(options)}

${this.inputBlock()}
`)
  }

  terraformBlock(): string {
    if (getAnnotation(this.currentBom, 'deployment-type/gitops') === 'true') {
      return `terraform {
  extra_arguments "reduced_parallelism" {
    commands  = get_terraform_commands_that_need_parallelism()
    arguments = ["-parallelism=2"]
  }
}
`
    }

    return ''
  }

  dependencyBlocks({flatten = false}: {flatten?: boolean} = {}): string {
    const mockOutputs = (outputs: string[], indent = '    '): string => {
      return outputs.map(output => `${indent}${output} = ""`).join('\n')
    }

    return this.dependencies
      .map(dep => {
        const path = flatten ? dep.path : `${dep.path}/terraform`

        return `dependency "${dep.name}" {
  config_path = "\${get_parent_terragrunt_dir()}/${path}"
  skip_outputs = false

  mock_outputs_allowed_terraform_commands = ["validate", "init", "plan", "destroy", "output"]
  mock_outputs = {
${mockOutputs(dep.outputs)}
  }
}
`
      })
      .join('\n')
  }

  inputBlock(): string {
    if (this.inputs.length === 0) {
      return ''
    }

    const inputs = (indent: string = '    '): string => {
      return this.inputs.map(input => `${indent}${input.name} = dependency.${input.dependency.name}.outputs.${input.output}`).join('\n')
    }

    return `inputs = {
${inputs()}
}`
  }
}

export interface TerragruntBaseModel {
}

export class TerragruntBase implements TerragruntBaseModel, OutputFile {
  name: string = 'terragrunt.hcl';
  type: OutputFileType = OutputFileType.terraform;

  contents(): Promise<string | Buffer> {
    return Promise.resolve(`skip = true

terraform {
  extra_arguments "reduced_parallelism" {
    commands  = get_terraform_commands_that_need_parallelism()
    arguments = ["-parallelism=6"]
  }

  extra_arguments "common_vars" {
    commands = get_terraform_commands_that_need_vars()

    required_var_files = [
      "\${get_parent_terragrunt_dir()}/terraform.tfvars"
    ]
  }
}
`)
  }
}
