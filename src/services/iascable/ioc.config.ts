import {IascableApi} from './iascable.api';
import {CatalogBuilder} from './iascable.impl';

export default [
  {bind: IascableApi, to: CatalogBuilder}
]
