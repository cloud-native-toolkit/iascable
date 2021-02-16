import {Container} from 'typescript-ioc';
import {TileBuilderApi} from './tile-builder.api';
import {TileBuilder} from './tile-builder.impl';

export * from './tile-builder.api';

Container.bind(TileBuilderApi).to(TileBuilder);

