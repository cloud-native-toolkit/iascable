import {
  BillOfMaterialModel,
  CatalogFilter,
  ModuleDoc,
  OutputFile,
  TerraformComponent,
  Tile,
  TileConfig
} from '../models';
import {DotGraphFile} from '../models/graph.model';
import {SolutionModel} from '../models/solution.model';
import {BundleWriter} from '../util/bundle-writer';
import {CustomResourceDefinition} from '../models/crd.model';
import {isDefined} from '../util/object-util';

export interface WritableBundle {
  writeBundle(bundleWriter: BundleWriter, options?: {flatten: boolean}): BundleWriter;
}

export interface IasableResult<T extends CustomResourceDefinition> {
  billOfMaterial: T
  supportingFiles?: OutputFile[]
}

export interface IascableBomResultBase extends IasableResult<BillOfMaterialModel> {
  terraformComponent: TerraformComponent;
  tile?: Tile;
  graph?: DotGraphFile;
}

export interface IascableBomResult extends IascableBomResultBase, WritableBundle {
  terraformComponent: TerraformComponent;
  tile?: Tile;
  graph?: DotGraphFile;
}

export const isIascableBomResult = (result: IasableResult<any>): result is IascableBomResult => {
  return isDefined(result) && isDefined((result as IascableBomResultBase).terraformComponent)
}

export interface IascableSolutionResultBase extends IasableResult<SolutionModel> {
  results: IascableBomResult[]
}

export interface IascableSolutionResult extends IascableSolutionResultBase, WritableBundle {
}

export const isIascableSolutionResult = (result: IasableResult<any>): result is IascableSolutionResult => {
  return isDefined(result) && isDefined((result as IascableSolutionResultBase).results)
}

export interface IascableBundleBase {
  results: Array<IascableBomResult | IascableSolutionResult>;
  supportingFiles: OutputFile[];
}

export interface IascableBundle extends IascableBundleBase, WritableBundle {
}

export interface IascableOptions {
  tileConfig?: TileConfig;
  filter?: CatalogFilter;
  interactive?: boolean;
}

export abstract class IascableApi {
  abstract build(catalogUrl: string, input?: BillOfMaterialModel, options?: IascableOptions): Promise<IascableBundle>;
  abstract buildBoms(catalogUrl: string | string[], input: Array<BillOfMaterialModel | SolutionModel>, options?: IascableOptions): Promise<IascableBundle>;
  abstract moduleDocumentation(catalogUrl: string | string[], moduleName: string, options?: IascableOptions): Promise<OutputFile>;
}
