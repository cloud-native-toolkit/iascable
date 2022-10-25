import {ModuleSelectorApi} from './module-selector.api';
import {ModuleSelector} from './module-selector.impl';

export default [
  {bind: ModuleSelectorApi, to: ModuleSelector}
]
