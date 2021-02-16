import {TerraformVariable, Tile, TileConfig} from '../../models';

export abstract class TileBuilderApi {
  abstract buildTileMetadata(variables: TerraformVariable[], tileConfig: TileConfig): Tile;
}
