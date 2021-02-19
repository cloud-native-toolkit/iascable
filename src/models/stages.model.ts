import {
  BaseVariable,
  fromBaseVariable,
  IBaseVariable,
  StagePrinter,
  TerraformVariable, TerraformVariableImpl
} from './variables.model';
import {OutputFile} from './file.model';
import {SingleModuleVersion} from './module.model';

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
  files: OutputFile[];
}

export class TerraformStageFile implements OutputFile {
  constructor(private stages: {[name: string]: Stage}) {
  }

  name = 'stages.tf';

  get contents(): string {
    const buffer: Buffer = Object.values(this.stages).reduce((previousBuffer: Buffer, stage: Stage) => {
      if (!stage.asString) {
        stage = new StageImpl(stage);
      }

      return Buffer.concat([
        previousBuffer,
        Buffer.from(stage.asString(this.stages))
      ]);
    }, Buffer.from(''));

    return buffer.toString();
  }
}

export class TerraformVariablesFile implements OutputFile {
  constructor(private variables: TerraformVariable[]) {
  }

  name = 'variables.tf';

  get contents(): string {
    const buffer: Buffer = this.variables.reduce((previousBuffer: Buffer, variable: TerraformVariable) => {
      if (!variable.asString) {
        variable = new TerraformVariableImpl(variable);
      }

      return Buffer.concat([
        previousBuffer,
        Buffer.from(variable.asString())
      ]);
    }, Buffer.from(''))

    return buffer.toString();
  }
}

export class TerraformComponent implements TerraformComponentModel {
  stages: { [source: string]: Stage } = {};
  baseVariables: TerraformVariable[] = [];

  constructor(model: TerraformComponentModel) {
    Object.assign(this, model);
  }

  set files(f: OutputFile[]) {
    // nothing to do
  }

  get files(): OutputFile[] {
    return [
      new TerraformStageFile(this.stages),
      new TerraformVariablesFile(this.baseVariables),
    ];
  }
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
