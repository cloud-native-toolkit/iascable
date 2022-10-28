import {TileBuilderApi} from './tile-builder.api';
import {TileBuilder} from './tile-builder.impl';

export default [
  {bind: TileBuilderApi, to: TileBuilder}
]
