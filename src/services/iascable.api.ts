import {BillOfMaterialModel, CatalogFilter, TerraformComponent, Tile, TileConfig} from '../models';
import {DotGraphFile} from '../models/graph.model';

export interface IascableResult {
  billOfMaterial: BillOfMaterialModel;
  terraformComponent: TerraformComponent;
  tile?: Tile;
  graph?: DotGraphFile;
}

export interface IascableOptions {
  tileConfig?: TileConfig;
  filter?: CatalogFilter;
  interactive?: boolean;
}

export abstract class IascableApi {
  abstract build(catalogUrl: string, input?: BillOfMaterialModel, options?: IascableOptions): Promise<IascableResult>;
  abstract buildBoms(catalogUrl: string, input: BillOfMaterialModel[], options?: IascableOptions): Promise<IascableResult[]>;
}
