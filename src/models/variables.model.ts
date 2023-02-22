import {BillOfMaterialProviderVariable} from './bill-of-material.model';
import {ModuleVariable} from './module.model';
import {arrayOf} from '../util';

export interface StagePrinter {
  asString(stages: {[name: string]: {name: string}}, path: string): string;
}

export interface IBaseVariable {
  name: string;
  description?: string;
  type?: string;
  alias?: string;
  defaultValue?: string;
  scope?: 'module' | 'global' | 'ignore';
  options?: Array<{label: string, value: string}>;
  required?: boolean;
  stageName?: string;
  important?: boolean;
  sensitive?: boolean;
}

export interface IBaseOutput {
  name: string;
  description?: string;
  value: string;
  sensitive?: boolean;
}

export interface BaseVariable extends IBaseVariable, StagePrinter {
}

export interface IModuleVariable extends IBaseVariable {
  moduleRef: {stageName: string} | {stageName: string}[];
  moduleOutputName: string;
  mapper?: 'equality' | 'collect';
}

export interface IModuleOutput extends BaseOutput {
  moduleRef: {stageName: string} | {stageName: string}[];
  moduleOutputName: string;
}

export interface IGlobalRefVariable extends IBaseVariable {
  variableName: string;
}

export interface IPlaceholderVariable extends IBaseVariable {
  variable: ModuleVariable;
  variableName?: string;
}

export interface TerraformProvider {
  name: string;
  alias?: string;
  source?: string;
  variables: BaseVariable[];
  stages: {[name: string]: {name: string}}

  asString(): string;
}

export function mergeVariables(variables: BillOfMaterialProviderVariable[], bomVariables: BillOfMaterialProviderVariable[] = []): BillOfMaterialProviderVariable[] {
  return variables.map(v => {
    return arrayOf(bomVariables)
      .filter(bomV => bomV.name === v.name)
      .first()
      .map(bomV => Object.assign({}, v, bomV))
      .orElse(v);
  })
}

export interface TerraformOutput extends IBaseOutput {
  asString(): string;
}

export interface TerraformVariable extends IBaseVariable {
  asString(): string;
}

export type Formatter = (value: string) => {type: string, value: string};

export interface BaseOutput extends IBaseOutput {
}
