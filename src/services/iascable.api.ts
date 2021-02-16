import {BillOfMaterialModel, CatalogFilter, TerraformComponent, Tile, TileConfig} from '../models';

export interface IascableResult {
  billOfMaterial: BillOfMaterialModel;
  terraformComponent: TerraformComponent;
  tile?: Tile;
}

export interface IascableOptions {
  tileConfig?: TileConfig;
  filter?: CatalogFilter;
  interactive?: boolean;
}

export abstract class IascableApi {
  abstract build(catalogUrl: string, input?: BillOfMaterialModel, options?: IascableOptions): Promise<IascableResult>;
}
