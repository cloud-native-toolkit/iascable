import {
  BaseVariable,
  IBaseOutput,
  IBaseVariable,
  StagePrinter,
  TerraformProvider,
} from './variables.model';
import {OutputFile} from './file.model';
import {SingleModuleVersion} from './module.model';
import {BillOfMaterialModel, BillOfMaterialVariable} from './bill-of-material.model';
import {CatalogV2Model} from './catalog.model';
import {TerragruntLayer} from './terragrunt.model';

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

export interface TfvarsVariable {
  name: string;
  defaultValue?: string;
  type?: string;
  description?: string;
  required?: boolean;
  important?: boolean;
  sensitive?: boolean;
}
