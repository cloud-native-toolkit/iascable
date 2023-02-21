import {BillOfMaterialModel} from './bill-of-material.model';
import {getAnnotation, getAnnotationList, getMetadataName} from './crd.model';
import {OutputFile, OutputFileType} from './file.model';
import { arrayOf, first, Optional } from '../util'
import { LayerNeeds, LayerProvides } from './layer-dependencies.model'
import { extractNeededCapabilitiesFromBom, extractProvidedCapabilitiesFromBom } from '../services'

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
    const needs: LayerNeeds[] = extractNeededCapabilitiesFromBom(this.currentBom)
    if (needs.length === 0) {
      return ''
    }

    const addInput = (input: TerragruntInputModel): TerragruntInputModel => {
      input.dependency.outputs.push(input.output)

      this.inputs.push(input)

      return input
    }

    needs
      .forEach((layerNeed: LayerNeeds) => {
        const need = layerNeed.name

        const bom: Optional<BillOfMaterialModel> = this.findMatchingDependency(need)

        if (!bom.isPresent()) {
          return
        }

        const providesBom: BillOfMaterialModel = bom.get()
        const layerProvides: LayerProvides[] = extractProvidedCapabilitiesFromBom(providesBom)

        if (need === 'cluster') {
          const providesPrefix: string = first(layerProvides.filter(val => val.name === need).map(val => val.alias))
            .orElse('cluster')

          const dependency: TerragruntDependencyModel = {
            name: 'cluster',
            path: getMetadataName(providesBom, 'cluster'),
            outputs: [],
          }

          this.dependencies.push(dependency)

          const needsPrefixes: string[] = layerNeed.aliases || ['cluster']

          // TODO include ca_cert variable (requires module changes)
          addInput({name: 'server_url', dependency, output: `${providesPrefix}_server_url`})
          needsPrefixes.forEach(needPrefix => {
            addInput({name: `${needPrefix}_server_url`, dependency, output: `${providesPrefix}_server_url`})
            addInput({name: `${needPrefix}_login_user`, dependency, output: `${providesPrefix}_username`})
            addInput({name: `${needPrefix}_login_password`, dependency, output: `${providesPrefix}_password`})
            addInput({name: `${needPrefix}_login_token`, dependency, output: `${providesPrefix}_token`})
          })
        } else if (need === 'gitops') {
          const providesPrefix: string = first(layerProvides.filter(val => val.name === need).map(val => val.alias))
            .orElse('gitops_repo_config')

          const dependency: TerragruntDependencyModel = {
            name: 'gitops',
            path: getMetadataName(providesBom, 'gitops'),
            outputs: [],
          }

          this.dependencies.push(dependency)

          const needsPrefixes: string[] = layerNeed.aliases || ['gitops_repo']
          needsPrefixes.forEach(needPrefix => {
            addInput({name: `${needPrefix}_host`, dependency, output: `${providesPrefix}_config_host`})
            addInput({name: `${needPrefix}_org`, dependency, output: `${providesPrefix}_config_org`})
            addInput({name: `${needPrefix}_repo`, dependency, output: `${providesPrefix}_config_name`})
            addInput({name: `${needPrefix}_project`, dependency, output: `${providesPrefix}_config_project`})
            addInput({name: `${needPrefix}_username`, dependency, output: `${providesPrefix}_config_username`})
            addInput({name: `${needPrefix}_token`, dependency, output: `${providesPrefix}_config_token`})
          })
        } else if (need === 'storage') {
          const providesPrefix: string = first(layerProvides.filter(val => val.name === need).map(val => val.alias))
            .orElse('storage')

          const dependency: TerragruntDependencyModel = {
            name: 'storage',
            path: getMetadataName(providesBom, 'storage'),
            outputs: [],
          }

          this.dependencies.push(dependency)

          const needsPrefixes: string[] = layerNeed.aliases || ['util-storage-class-manager']
          needsPrefixes.forEach(needPrefix => {
            addInput({name: `${needPrefix}_rwx_storage_class`, dependency, output: `${providesPrefix}_rwx_storage_class`})
            addInput({name: `${needPrefix}_rwo_storage_class`, dependency, output: `${providesPrefix}_rwo_storage_class`})
            addInput({name: `${needPrefix}_file_storage_class`, dependency, output: `${providesPrefix}_file_storage_class`})
            addInput({name: `${needPrefix}_block_storage_class`, dependency, output: `${providesPrefix}_block_storage_class`})
          })
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
    optional_var_files = [
      "\${get_parent_terragrunt_dir()}/credentials.auto.tfvars"
    ]
  }
}
`)
  }
}
