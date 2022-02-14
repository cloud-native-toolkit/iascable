import {
  BaseVariable,
  fromBaseVariable,
  IBaseVariable,
  StagePrinter, TerraformProvider, TerraformTfvars,
  TerraformVariable,
  TerraformVariableImpl
} from './variables.model';
import {OutputFile, OutputFileType, UrlFile} from './file.model';
import {ModuleProvider, SingleModuleVersion} from './module.model';
import {BillOfMaterialVariable} from './bill-of-material.model';
import {ArrayUtil, of as arrayOf} from '../util/array-util';
import {Optional} from '../util/optional';
import {isDefinedAndNotNull} from '../util/object-util';

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
  bomVariables?: BillOfMaterialVariable[];
  modules?: SingleModuleVersion[];
  providers?: TerraformProvider[];
  files: OutputFile[];
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

export class TerraformTfvarsFile implements OutputFile {

  name : string;
  type = OutputFileType.terraform;

  constructor(private variables: TerraformVariable[], private bomVariables?: BillOfMaterialVariable[], name?: string) {
    if (name) {
      this.name = `${name}.auto.tfvars`;
    } else {
      this.name = 'terraform.tfvars';
    }
  }

  get contents(): Promise<string | Buffer> {

    const variableNames: string[] = arrayOf(this.bomVariables).map(v => v.name).asArray();

    const buffer: Buffer = this.variables
      .map(mergeBomVariables(arrayOf(this.bomVariables)))
      .reduce((previousBuffer: Buffer, variable: TerraformVariable) => {
        const terraformVar = new TerraformVariableImpl(variable);

        if (!(terraformVar.defaultValue === undefined || terraformVar.defaultValue === null || terraformVar.required || variableNames.includes(terraformVar.name)) && !terraformVar.important) {
          return previousBuffer;
        }

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
  bomVariables?: BillOfMaterialVariable[] = []
  modules?: SingleModuleVersion[];
  providers?: TerraformProvider[];

  constructor(model: TerraformComponentModel, private name: string | undefined) {
    Object.assign(this as TerraformComponentModel, model);
  }

  set files(f: OutputFile[]) {
    // nothing to do
  }

  get files(): OutputFile[] {
    const files: Array<OutputFile | undefined> = [
      new TerraformStageFile(this.stages),
      new TerraformVariablesFile(this.baseVariables, this.bomVariables),
      this.providers !== undefined && this.providers.length > 0 ? new TerraformProvidersFile(this.providers) : undefined,
      this.providers !== undefined && this.providers.length > 0 ? new TerraformVersionFile(this.providers) : undefined,
      new TerraformTfvarsFile(this.baseVariables, this.bomVariables, this.name),
      ...buildModuleReadmes(this.modules),
    ];

    return files.filter(f => f !== undefined) as OutputFile[];
  }
}

function buildModuleReadmes(modules: SingleModuleVersion[] = []): OutputFile[] {
  return modules.map(module => {
    const url = getModuleDocumentationUrl(module);

    return new UrlFile({
      name: `docs/${module.name}.md`,
      type: OutputFileType.documentation,
      url
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

  asString(stages: {[name: string]: {name: string}}): string {
    return `module "${this.name}" {
  source = "${this.module.id}?ref=${this.module.version.version}"

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
    const variableString: string = this.variables
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

    return variableString;
  }
}
