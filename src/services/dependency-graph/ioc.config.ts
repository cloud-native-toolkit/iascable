import {DependencyGraphApi} from './dependency-graph.api';
import {DependencyGraphImpl} from './dependency-graph.impl';

export default [
  {bind: DependencyGraphApi, to: DependencyGraphImpl}
];
