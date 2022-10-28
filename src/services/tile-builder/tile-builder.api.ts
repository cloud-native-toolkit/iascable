import {IBaseVariable, TerraformVariable, Tile, TileConfig} from '../../models';

export abstract class TileBuilderApi {
  abstract buildTileMetadata(variables: IBaseVariable[], tileConfig: TileConfig): Tile;
}
