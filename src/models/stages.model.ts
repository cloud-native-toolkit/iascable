import {
  BaseVariable,
  fromBaseVariable,
  IBaseVariable,
  StagePrinter,
  TerraformVariable,
  TerraformVariableImpl
} from './variables.model';
import {OutputFile, OutputFileType, UrlFile} from './file.model';
import {SingleModuleVersion} from './module.model';
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
  files: OutputFile[];
}

export class TerraformStageFile implements OutputFile {
  constructor(private stages: {[name: string]: Stage}) {
  }

  name = 'stages.tf';
  type = OutputFileType.terraform;

  get contents(): Promise<string | Buffer> {
    const buffer: Buffer = Object.values(this.stages).reduce((previousBuffer: Buffer, stage: Stage) => {
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
  if (isDefinedAndNotNull((value))) {
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

export class TerraformComponent implements TerraformComponentModel {
  stages: { [name: string]: Stage } = {};
  baseVariables: TerraformVariable[] = [];
  bomVariables?: BillOfMaterialVariable[] = []
  modules?: SingleModuleVersion[];

  constructor(model: TerraformComponentModel) {
    Object.assign(this, model);
  }

  set files(f: OutputFile[]) {
    // nothing to do
  }

  get files(): OutputFile[] {
    const files: OutputFile[] = [
      new TerraformStageFile(this.stages),
      new TerraformVariablesFile(this.baseVariables, this.bomVariables),
      ...buildModuleReadmes(this.modules),
    ];

    return files;
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

${this.variablesAsString(stages)}
}
`;
  }

  variablesAsString(stages: {[name: string]: {name: string}}, indent: string = '  '): string {
    const variableBuffer: Buffer = this.variables
      .filter(v => !!v)
      .reduce((buffer: Buffer, variable: BaseVariable) => {
        if (!variable.asString) {
          variable = fromBaseVariable(variable);
        }

        return Buffer.concat([
          buffer,
          Buffer.from(indent + variable.asString(stages))
        ]);
      }, Buffer.from(''));

    return variableBuffer.toString();
  }
}
