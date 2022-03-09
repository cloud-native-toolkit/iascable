import {Container} from 'typescript-ioc';
import {DependencyGraphApi} from './dependency-graph.api';
import {DependencyGraphImpl} from './dependency-graph.impl';

export * from './dependency-graph.api'

Container.bind(DependencyGraphApi).to(DependencyGraphImpl);
