import {Container} from 'typescript-ioc'
import YAML from 'js-yaml'
import {get, Response} from 'superagent'
import ZSchema from 'z-schema'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import Optional from 'js-optional'

import {LoggerApi} from '../../util/logger'
import {
  ModuleInterfaceModel,
  Module,
  ModuleOutput,
  ModuleVariable,
  ModuleVersion
} from '../../models'
import {YamlFile} from '../../util/yaml-file/yaml-file'
import {TerraformFile, TerraformOutputModel, TerraformVariableModel} from '../../util/terraform/terraform-file'
import {rightDifference, first} from '../../util/array-util'
import {InterfaceError, InterfaceErrors} from './errors'
import {
  ModuleMetadataApi,
  ModuleServiceCreateParams,
  ModuleServiceCreateResult,
  ModuleServiceVerifyParams
} from './module-metadata.api';

export class ModuleMetadataService implements ModuleMetadataApi {
  private logger: LoggerApi

  constructor() {
    this.logger = Container.get(LoggerApi)
  }

  async create({
    version = '0.0.0',
    repoSlug,
    strict,
    metadataFile = 'module.yaml',
    metadataUrl
  }: ModuleServiceCreateParams): Promise<ModuleServiceCreateResult> {
    const metadata: Module = await this.buildModuleMetadata({
      version,
      repoSlug,
      strict,
      metadataFile
    })

    const mergedMetadata: Module = await this.mergeModuleMetadata({
      metadataUrl,
      metadata
    })

    return {
      metadata: mergedMetadata
    }
  }

  async buildModuleMetadata({
    version = '0.0.1',
    repoSlug,
    strict,
    metadataFile = 'module.yaml'
  }: ModuleServiceCreateParams): Promise<Module> {
    this.logger.debug(`Loading metadata file: ${metadataFile}`)

    const metadata: Module = (await YamlFile.load(metadataFile))
      .contents

    this.logger.debug(`Loaded metadata: ${JSON.stringify(metadata)}`)

    metadata.id = repoSlug

    if (/v?0[.]0[.]0/.test(version)) {
      this.logger.info('Found version 0.0.0. Creating empty metadata.')
      metadata.versions = []

      return metadata
    }

    const metadataVersion: ModuleVersion = metadata.versions[0]

    metadataVersion.version = version

    metadataVersion.variables = await this.parseModuleVariables(
      metadataVersion.variables,
      strict
    )
    metadataVersion.outputs = await this.parseModuleOutputs(
      metadataVersion.outputs,
      strict
    )

    return metadata
  }

  async parseModuleVariables(
    metadataVariables: ModuleVariable[],
    strict = false
  ): Promise<ModuleVariable[]> {
    this.logger.debug(`Parsing module variables...`)

    const variables: TerraformVariableModel[] = await this.loadVariables()

    this.logger.debug(`Metadata variables: ${JSON.stringify(metadataVariables)}`)
    this.logger.debug(`Terraform variables: ${JSON.stringify(variables)}`)

    const variableNames = variables.map(v => v.name)

    const result: string[] = metadataVariables
      .map(m => m.name)
      .filter(m => !variableNames.includes(m))

    if (strict && result.length > 0) {
      throw new Error(
        `Variables in metadata that don't exist in module: ${JSON.stringify(
          result
        )}`
      )
    } else if (result.length > 0) {
      this.logger.warn(
        `Variables in metadata that don't exist in module: ${JSON.stringify(
          result
        )}`
      )
    }

    return variables.map((t: TerraformVariableModel) => {
      const filteredVariables: ModuleVariable[] =
        metadataVariables.filter(m => m.name === t.name)

      if (filteredVariables.length > 0) {
        const metadataVariable: ModuleVariable = filteredVariables[0]

        this.logger.debug(
          `Merging variable: ${JSON.stringify({
            terraform: t,
            metadata: metadataVariable
          })}`
        )
        return Object.assign({}, t, metadataVariable)
      }

      return t as ModuleVariable
    })
  }

  async loadVariables(): Promise<TerraformVariableModel[]> {
    const {variables} = await TerraformFile.load('variables.tf')

    return variables
  }

  async parseModuleOutputs(
    metadataOutputs: ModuleOutput[] = [],
    strict = false
  ): Promise<ModuleOutput[]> {
    this.logger.debug(`Parsing module outputs...`)

    const outputs: TerraformOutputModel[] = await this.loadOutputs()

    const outputNames = outputs.map(o => o.name)

    const result: string[] = metadataOutputs
      .map(m => m.name)
      .filter(m => !outputNames.includes(m))
    if (strict && result.length > 0) {
      throw new Error(
        `Outputs in metadata that don't exist in module: ${JSON.stringify(
          result
        )}`
      )
    } else if (result.length > 0) {
      this.logger.warn(
        `Outputs in metadata that don't exist in module: ${JSON.stringify(
          result
        )}`
      )
    }

    return outputs.map(t => {
      const metadataOutput: Optional<ModuleOutput> = first(
        metadataOutputs.filter(m => m.name === t.name)
      )

      if (metadataOutput.isPresent()) {
        return Object.assign({}, t, metadataOutput.get())
      }

      return t
    })
  }

  async loadOutputs(): Promise<TerraformOutputModel[]> {
    const {outputs} = await TerraformFile.load('outputs.tf')

    return outputs
  }

  async mergeModuleMetadata({
    metadata,
    metadataUrl
  }: {
    metadata: Module,
    metadataUrl?: string
  }): Promise<Module> {
    this.logger.debug(`Merging module metadata...`)
    const existingMetadata: Module | undefined = await this.loadMetadata({metadataUrl})

    if (!existingMetadata) {
      return metadata
    }

    const versions = metadata.versions.slice()
    versions.push(...existingMetadata.versions)

    return Object.assign({}, existingMetadata, metadata, {
      versions
    })
  }

  async loadMetadata({
    metadataUrl
  }: {
    metadataUrl?: string
  }): Promise<Module | undefined> {
    if (!metadataUrl) {
      return
    }

    try {
      const response: Response = await get(metadataUrl)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return YAML.load(response.text) as any
    } catch (err) {
      this.logger.debug(`No existing catalog found: ${metadataUrl}`)
    }

    return
  }

  async verify({metadata}: ModuleServiceVerifyParams): Promise<{}> {
    const schema = await this.loadSchema()

    this.logger.debug('Validating Schema')
    await this.validateSchema(metadata, schema)

    this.logger.debug('Validating Interfaces')
    await this.validateInterfaces(metadata)

    return {}
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async loadSchema(): Promise<any> {
    this.logger.debug('Loading Schema')
    const url = 'https://modules.cloudnativetoolkit.dev/schemas/module.json'

    const response: Response = await get(url)

    const result: string = response.text

    return JSON.parse(result)
  }

  async validateSchema(
    metadata: Module,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    schema: any
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const validator: ZSchema = new ZSchema({})

      validator.validate(metadata, schema, (err: Error, valid: boolean) => {
        if (!valid) {
          reject(err)
          return
        }

        resolve()
      })
    })
  }

  async validateInterfaces(metadata: Module): Promise<void> {
    const interfaces: ModuleInterfaceModel[] = await Promise.all(
      (metadata.interfaces || []).map(async name => {
        return this.loadInterface(name)
      })
    )

    const errors: InterfaceError[] = interfaces
      .map(testInterface(this.processMetadata(metadata)))
      .filter(v => !!v) as InterfaceError[]

    if (errors.length > 0) {
      throw new InterfaceErrors(errors)
    }
  }

  processMetadata(metadata: Module): {
    variables: string[]
    outputs: string[]
  } {
    const variables: string[] = first(metadata.versions)
      .map((v: ModuleVersion) => v.variables)
      .map((v: ModuleVariable[]) => v.map(x => x.name))
      .orElse([])
    const outputs: string[] = first(metadata.versions)
      .map((v: ModuleVersion) => v.outputs)
      .map((v: ModuleOutput[]) => v.map(x => x.name))
      .orElse([])

    return {variables, outputs}
  }

  async loadInterface(id: string): Promise<ModuleInterfaceModel> {
    const shortName: string = id.replace(/.*#(.*)/g, '$1')

    const url = `https://modules.cloudnativetoolkit.dev/interfaces/${shortName}.yaml`
    return get(url)
      .then((response: Response) => response.text)
      .then(text => YAML.load(text) as ModuleInterfaceModel)
  }
}

const testInterface = (module: {variables: string[]; outputs: string[]}) => {
  return (val: ModuleInterfaceModel): InterfaceError | undefined => {
    const missingVariables: string[] = rightDifference(
      module.variables,
      (val.variables || []).map(v => v.name)
    )
    const missingOutputs: string[] = rightDifference(
      module.outputs,
      (val.outputs || []).map(v => v.name)
    )

    if (missingVariables.length > 0 || missingOutputs.length > 0) {
      return new InterfaceError({id: val.id, missingVariables, missingOutputs})
    }

    return
  }
}
