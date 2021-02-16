import {Container} from 'typescript-ioc';
import {ModuleSelectorApi} from './module-selector.api';
import {ModuleSelector} from './module-selector.impl';

export * from './module-selector.api';
export * from './module-selector.impl';

Container.bind(ModuleSelectorApi).to(ModuleSelector);
