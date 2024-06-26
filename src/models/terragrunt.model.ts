import { BillOfMaterialModel } from './bill-of-material.model'
import { getAnnotation, getAnnotationList, getMetadataName } from './crd.model'
import { OutputFile, OutputFileType } from './file.model'
import { arrayOf, first, Optional } from '../util'
import { LayerNeeds, LayerProvides } from './layer-dependencies.model'
import { extractNeededCapabilitiesFromBom, extractProvidedCapabilitiesFromBom } from '../services'
import { CapabilityModel } from './capability.model'

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

export interface TerragruntBackendModel {
  name: string;
  config?: unknown;
}

export class TerragruntLayer implements TerragruntLayerModel, OutputFile {
  name: string = 'terragrunt.hcl';
  type: OutputFileType = OutputFileType.terraform;

  currentBom: BillOfMaterialModel
  boms: BillOfMaterialModel[]

  inputs: TerragruntInputModel[] = []
  dependencies: TerragruntDependencyModel[] = []
  capabilities: CapabilityModel[] = []

  constructor({currentBom, boms = [], capabilities = []}: {currentBom: BillOfMaterialModel, boms?: BillOfMaterialModel[], capabilities?: CapabilityModel[]}) {
    this.currentBom = currentBom
    this.boms = boms
    this.capabilities = capabilities

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

    needs.forEach((layerNeed: LayerNeeds) => {
      const need = layerNeed.name

      const bom: Optional<BillOfMaterialModel> = this.findMatchingDependency(need)

      if (!bom.isPresent()) {
        return
      }

      const providesBom: BillOfMaterialModel = bom.get()
      const layerProvides: LayerProvides[] = extractProvidedCapabilitiesFromBom(providesBom)

      const capability: CapabilityModel = first(this.capabilities.filter(capability => capability.name === need))
        .orElse(undefined as any)

      if (!capability) {
        return
      }

      const dependency: TerragruntDependencyModel = {
        name: capability.name,
        path: getMetadataName(providesBom, capability.name),
        outputs: [],
      }

      this.dependencies.push(dependency)

      const providesPrefix: string = first(layerProvides.filter(val => val.name === need).map(val => val.alias))
        .orElse(capability.defaultProviderAlias || capability.name)
      const needsPrefixes: string[] = layerNeed.aliases || [capability.defaultConsumerAlias || capability.name]

      capability.mapping.forEach(mapping => {
        const prefixes = mapping.destinationGlobal ? [''] : needsPrefixes

        prefixes.forEach(needPrefix => {
          const name = needPrefix ? `${needPrefix}_${mapping.destination}` : mapping.destination
          const output = `${providesPrefix}_${mapping.source}`

          addInput({name, dependency, output})
        })
      })
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
  backend?: TerragruntBackendModel;

  constructor({backend}: {backend?: TerragruntBackendModel} = {}) {
    this.backend = backend;
  }

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
${this.generateBackend()}
`)
  }

  generateBackend(): string {
    if (!this.backend) {
      return ''
    }

    const backend: TerragruntBackendBase = backends[this.backend.name]

    if (!backend) {
      console.log('Unknown backend configuration: ' + this.backend.name)
      return ''
    }

    return backend.contents(this.backend.config)
  }

  generateBackendConfig(config: any, indent: string = ''): string {
    return Object
      .keys(config)
      .map(key => `${indent}${key} = ${valueToString(config[key])}`)
      .join('\n')
  }
}

const valueToString = (value: any): string => {
  if (typeof value === 'boolean') {
    return value.toString()
  }

  return `"${value.toString()}"`
}

abstract class TerragruntBackendBase implements TerragruntBackendModel {
  name: string;

  constructor(name: string) {
    this.name = name;
  }

  contents(backendConfig: unknown): string {
    const config = this.buildConfig(backendConfig)

    return `
generate "backend" {
  path      = "backend.tf"
  if_exists = "overwrite_terragrunt"
  contents  = <<EOF
terraform {
  backend "${this.name}" {
${this.generateBackendConfig(config, '    ')}
  }
}
EOF
}
`
  }

  abstract buildConfig(backendConfig: unknown): any;

  generateBackendConfig(config: any, indent: string = ''): string {
    return Object
      .keys(config)
      .map(key => `${indent}${key} = ${valueToString(config[key])}`)
      .join('\n')
  }
}

class TerragruntKubernetesBackend extends TerragruntBackendBase implements TerragruntBackendModel {
  constructor() {
    super('kubernetes')
  }

  buildConfig(backendConfig: unknown): any {
    const config = Object.assign(
      {
        secret_suffix: '\${replace(replace(path_relative_to_include(), "/terraform", ""), "/", "-")}',
        in_cluster_config: true,
      },
      backendConfig || {}
    )

    return config
  }
}

class CosKubernetesBackend extends TerragruntBackendBase implements TerragruntBackendModel {
  constructor() {
    super('cos')
  }

  buildConfig(backendConfig: unknown): any {
    const config = Object.assign(
      {
        prefix: '\${replace(replace(path_relative_to_include(), "/terraform", ""), "/", "-")}',
        bucket: `bucket-for-terraform-state-${new Date().getTime()}`
      },
      backendConfig || {}
    )

    return config
  }
}

const backends: {[key: string]: TerragruntBackendBase} = {
  'kubernetes': new TerragruntKubernetesBackend(),
  'cos': new CosKubernetesBackend(),
}
