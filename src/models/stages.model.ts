import {Container} from 'typescript-ioc';
import {dump} from 'js-yaml';

import {
  BaseVariable,
  fromBaseVariable,
  IBaseOutput,
  IBaseVariable,
  StagePrinter,
  TerraformOutput,
  TerraformOutputImpl,
  TerraformProvider,
  TerraformTfvars,
  TerraformVariable,
  TerraformVariableImpl
} from './variables.model';
import {OutputFile, OutputFileType, UrlFile} from './file.model';
import {Module, ModuleProvider, SingleModuleVersion} from './module.model';
import {BillOfMaterialModel, BillOfMaterialVariable} from './bill-of-material.model';
import {ArrayUtil, of as arrayOf} from '../util/array-util/array-util';
import {Optional} from '../util/optional';
import {isDefined, isDefinedAndNotNull} from '../util/object-util';
import {ModuleDocumentationApi} from '../services/module-documentation';
import {CatalogV2Model} from './catalog.model';
import {TerragruntLayer} from './terragrunt.model';

export * from './module.model';

export interface IStage {
  name: string;
  source: string;
  module: SingleModuleVersion;
  variables: Array<BaseVariable>;
}

export interface Stage extends IStage, StagePrinter {
}

export interface TerraformComponentModel {
  stages: { [source: string]: Stage };
  baseVariables: IBaseVariable[];
  baseOutputs: IBaseOutput[];
  bomVariables?: BillOfMaterialVariable[];
  modules?: SingleModuleVersion[];
  providers?: TerraformProvider[];
  billOfMaterial?: BillOfMaterialModel;
  terragrunt?: TerragruntLayer;
  files: OutputFile[];
  catalog: CatalogV2Model;
}

export class TerraformStageFile implements OutputFile {
  constructor(private stages: {[name: string]: Stage}) {
  }

  name = 'main.tf';
  type = OutputFileType.terraform;

  get contents(): Promise<string | Buffer> {
    const buffer: Buffer = Object
      .values(this.stages)
      .sort((a: Stage, b: Stage) => a.name.localeCompare(b.name))
      .reduce((previousBuffer: Buffer, stage: Stage) => {
        if (!stage.asString) {
          stage = new StageImpl(stage);
        }

        return Buffer.concat([
          previousBuffer,
          Buffer.from(stage.asString(this.stages))
        ]);
      }, Buffer.from(''));

    return Promise.resolve(buffer);
  }
}

function getValue(value?: string, defaultValue?: string): string | undefined {
  if (isDefinedAndNotNull(value)) {
    return value;
  }

  return defaultValue;
}

function mergeBomVariables(bomVariables: ArrayUtil<BillOfMaterialVariable>) {
  return (variable: TerraformVariable): TerraformVariable => {
    const bomVariable: Optional<BillOfMaterialVariable> = bomVariables
      .filter(v => v.name === variable.name)
      .first();

    if (!bomVariable.isPresent()) {
      return variable;
    }

    return Object.assign(
      {},
      variable,
      bomVariable.get(),
      {defaultValue: getValue(bomVariable.get().value, variable.defaultValue)}
    );
  };
}

export class TerraformVersionFile implements OutputFile {
  constructor(private providers: TerraformProvider[]) {
  }

  name = 'version.tf';

  private getSourceString(provider: TerraformProvider, indent: string = ' '): string {
    if (!provider.source) {
      return '';
    }

    return `${indent}source = "${provider.source}"\n`
  }

  get contents(): Promise<string | Buffer> {
    const indent = '    ';

    const providerString: string = this.providers
      .reduce((providerSet: TerraformProvider[], currentProvider: TerraformProvider) => {
        if (!providerSet.map(p => p.name).includes(currentProvider.name)) {
          providerSet.push(currentProvider);
        }

        return providerSet;
      }, [])
      .map(p => {
        return `${indent}${p.name} = {
${this.getSourceString(p, `${indent}  `)}${indent}}
`;
      })
      .join('\n');

    const result = `terraform {
  required_providers {
${providerString}
  }
}`
    return Promise.resolve(result);
  }
}

export class TerraformProvidersFile implements OutputFile {
  constructor(private providers: TerraformProvider[]) {
  }

  name = 'providers.tf';

  get contents(): Promise<string | Buffer> {
    const buffer: Buffer = this.providers
      .reduce((previousBuffer: Buffer, provider: TerraformProvider) => {
        return Buffer.concat([
          previousBuffer,
          Buffer.from('\n'),
          Buffer.from(provider.asString())
        ])
      }, Buffer.from(''));

    return Promise.resolve(buffer);
  }
}

export class TerraformVariablesFile implements OutputFile {
  constructor(private variables: TerraformVariable[], private bomVariables?: BillOfMaterialVariable[]) {
  }

  name = 'variables.tf';
  type = OutputFileType.terraform;

  get contents(): Promise<string | Buffer> {

    const buffer: Buffer = this.variables
      .map(mergeBomVariables(arrayOf(this.bomVariables)))
      .reduce((previousBuffer: Buffer, variable: TerraformVariable) => {
        if (!variable.asString) {
          variable = new TerraformVariableImpl(variable);
        }

        return Buffer.concat([
          previousBuffer,
          Buffer.from(variable.asString())
        ]);
      }, Buffer.from(''));

    return Promise.resolve(buffer);
  }
}

export class TerraformOutputFile implements OutputFile {
  constructor(private outputs: TerraformOutput[]) {
  }

  name = 'output.tf';
  type = OutputFileType.terraform;

  get contents(): Promise<string | Buffer> {

    const buffer: Buffer = this.outputs
      .reduce((previousBuffer: Buffer, output: TerraformOutput) => {
        if (!output.asString) {
          output = new TerraformOutputImpl(output);
        }

        return Buffer.concat([
          previousBuffer,
          Buffer.from(output.asString())
        ]);
      }, Buffer.from(''));

    return Promise.resolve(buffer);
  }
}

export class CredentialsPropertiesFile implements OutputFile {
  name: string;
  type: OutputFileType = OutputFileType.terraform;

  private variables: TerraformVariable[]
  private readonly template: boolean;

  constructor({variables, name = 'credentials.properties', template = false}: {variables: TerraformVariable[], name?: string, template?: boolean}) {
    this.name = name;
    this.variables = variables || [];
    this.template = template;
  }

  get contents(): Promise<string | Buffer> {
    return Promise.resolve(this.variables.map(this.variableToProperty).join('\n'))
  }

  variableToProperty(variable: TerraformVariable): string {
    return `${this.template ? '#' : ''}export TF_VAR_${variable.name} = "${variable.defaultValue || ''}"`
  }
}

export class VariablesYamlFile implements OutputFile {
  name: string;
  type: OutputFileType = OutputFileType.documentation;

  variables: TerraformVariable[];

  constructor({name = 'variables.yaml', variables}: {name?: string, variables: TerraformVariable[]}) {
    this.name = name;
    this.variables = variables;
  }

  get contents(): Promise<string | Buffer> {
    return Promise.resolve(dump({variables: this.variables}))
  }
}

export class TerraformTfvarsFile implements OutputFile {

  name : string;
  type = OutputFileType.terraform;
  variables: TerraformVariable[];

  constructor(variables: TerraformVariable[], public bomVariables?: BillOfMaterialVariable[], name?: string) {
    if (name) {
      this.name = `${name}.auto.tfvars`;
    } else {
      this.name = 'terraform.tfvars';
    }

    const variableNames: string[] = arrayOf(this.bomVariables).map(v => v.name).asArray();

    this.variables = variables
      .map(mergeBomVariables(arrayOf(bomVariables)))
      .filter(variable => {
        const terraformVar = new TerraformVariableImpl(variable);

        return !(!(terraformVar.defaultValue === undefined || terraformVar.defaultValue === null || terraformVar.required || variableNames.includes(terraformVar.name)) && !terraformVar.important)
      })
  }

  get contents(): Promise<string | Buffer> {

    const buffer: Buffer = this.variables
      .reduce((previousBuffer: Buffer, variable: TerraformVariable) => {
        const terraformVar = new TerraformVariableImpl(variable);

        variable = new TerraformTfvars({name: terraformVar.name, description: terraformVar.description, value: terraformVar.defaultValue || ""});

        return Buffer.concat([
          previousBuffer,
          Buffer.from(variable.asString())
        ]);
      }, Buffer.from(''));

    return Promise.resolve(buffer);
  }
}

export class TerraformComponent implements TerraformComponentModel {
  stages: { [name: string]: Stage } = {};
  baseVariables: TerraformVariable[] = [];
  baseOutputs: TerraformOutput[] = [];
  bomVariables?: BillOfMaterialVariable[] = []
  modules?: SingleModuleVersion[];
  providers?: TerraformProvider[];
  billOfMaterial?: BillOfMaterialModel;
  terragrunt?: TerragruntLayer;
  tfvarsFile: TerraformTfvarsFile;
  catalog!: CatalogV2Model;

  constructor(model: TerraformComponentModel, private name: string | undefined) {
    Object.assign(this as TerraformComponentModel, model);

    this.tfvarsFile = new TerraformTfvarsFile(this.baseVariables, this.bomVariables, this.name);

    if (this.billOfMaterial) {
      const bomVariables: BillOfMaterialVariable[] = this.tfvarsFile.variables.map(v => Object.assign(
        {
          name: v.name,
        },
        isDefinedAndNotNull(v.type) ? {type: v.type} : {},
        isDefinedAndNotNull(v.description) ? {description: v.description} : {},
        isDefinedAndNotNull(v.defaultValue) ? {value: v.defaultValue} : {},
        isDefinedAndNotNull((v as any).sensitive || (v as any).variable?.sensitive) ? {sensitive: (v as any).sensitive || (v as any).variable?.sensitive} : {}
      ))
      const bomSpec = Object.assign(this.billOfMaterial.spec, {variables: bomVariables})

      this.billOfMaterial = Object.assign(this.billOfMaterial, {spec: bomSpec})
    }
  }

  get files(): OutputFile[] {
    return [
      new TerraformStageFile(this.stages),
      new TerraformVariablesFile(this.baseVariables, this.bomVariables),
      new TerraformOutputFile(this.baseOutputs),
      this.providers !== undefined && this.providers.length > 0 ? new TerraformProvidersFile(this.providers) : undefined,
      this.providers !== undefined && this.providers.length > 0 ? new TerraformVersionFile(this.providers) : undefined,
      this.terragrunt,
      this.tfvarsFile,
      ...buildModuleReadmes(this.catalog, this.modules),
    ]
      .filter(isDefined)
      .map(v => v as OutputFile)
  }

  set files(files: OutputFile[]) {
    // nothing to do
  }
}

function buildModuleReadmes(catalog: CatalogV2Model, modules: SingleModuleVersion[] = []): OutputFile[] {
  const docService: ModuleDocumentationApi = Container.get(ModuleDocumentationApi)

  return modules.map(module => {
    const url: string = getModuleDocumentationUrl(module);

    const fullModule: Module = Object.assign({}, module, {versions: [module.version]})

    return new UrlFile({
      name: `docs/${module.name}.md`,
      type: OutputFileType.documentation,
      url,
      alternative: async () => {
        const readme = await docService.generateDocumentation(fullModule, catalog, modules)

        return readme.contents
      }
    });
  });
}

function getModuleDocumentationUrl(module: SingleModuleVersion): string {
  if (module.documentation) {
    return module.documentation;
  }

  const regex = new RegExp('[^/]+/(.*)')
  const gitSlug = module.id.replace(regex, '$1');
  const branch = 'main';

  return `https://raw.githubusercontent.com/${gitSlug}/${branch}/README.md`;
}

export class StageImpl implements Stage, StagePrinter {
  name: string;
  source: string;
  module: SingleModuleVersion;
  variables: Array<BaseVariable>;

  constructor(values: IStage) {
    this.name = values.name;
    this.source = values.source;
    this.module = values.module;
    this.variables = values.variables;
  }

  sourceString(indent: string = '  '): string {
    if (this.module.registryId) {
      const version = this.module.version.version ? `${indent}version = "${this.module.version.version.replace('v', '')}"` : ''

      return `${indent}source = "${this.module.registryId}"
${version}`
    }

    const urlRef = this.module.version.version && !this.module.id.startsWith('file:') ? `?ref=${this.module.version.version}` : ''
    return `${indent}source = "${this.module.id}${urlRef}"`
  }

  asString(stages: {[name: string]: {name: string}}): string {
    return `module "${this.name}" {
${this.sourceString()}

${this.providersAsString(this.module.version.providers)}${this.variablesAsString(stages)}
}
`;
  }

  private providerHasAlias(providers: ModuleProvider[]): boolean {
    return providers
      .map(p => p.alias)
      .filter(a => !!a).length > 0;
  }

  providersAsString(providers?: ModuleProvider[], indent: string = '  '): string {
    if (!providers || providers.length === 0) {
      return '';
    }

    if (!this.providerHasAlias(providers)) {
      return '';
    }

    const providerString: string = providers
      .map(p => {
        const ref = p.alias ? `${p.name}.${p.alias}` : p.name

        return `${indent}  ${p.name} = ${ref}`
      })
      .join('\n');

    return `${indent}providers = {
${providerString}
${indent}}
`;
  }

  variablesAsString(stages: {[name: string]: {name: string}}, indent: string = '  '): string {
    return this.variables
      .filter(v => !!v)
      .sort((a: BaseVariable, b: BaseVariable) => a.name.localeCompare(b.name))
      .map(v => fromBaseVariable(v))
      .filter(v => {
        const result = !!(v.asString);

        if (!result) {
          console.log('Variable missing asString: ' + v.name, v);
        }

        return result;
      })
      .map(variable => indent + variable.asString(stages))
      .join('\n');
  }
}
