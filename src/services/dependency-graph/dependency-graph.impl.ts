import {DependencyGraphApi} from './dependency-graph.api';
import {BillOfMaterialModel, Catalog, SingleModuleVersion} from '../../models';
import {DotGraph, DotNode} from '../../models/graph.model';
import {of as arrayOf} from '../../util/array-util';
import {Optional} from '../../util/optional';
import {Inject} from 'typescript-ioc';
import {CatalogLoaderApi} from '../catalog-loader';
import {ModuleSelectorApi} from '../module-selector';

export class DependencyGraphImpl implements DependencyGraphApi {
  @Inject
  loader!: CatalogLoaderApi;
  @Inject
  moduleSelector!: ModuleSelectorApi;

  async buildFromBom(billOfMaterial: BillOfMaterialModel, catalogUrl: string = 'https://modules.cloudnativetoolkit.dev/index.yaml'): Promise<DotGraph> {
    const catalog: Catalog = await this.loader.loadCatalog(catalogUrl);

    const modules: SingleModuleVersion[] = await this.moduleSelector.resolveBillOfMaterial(catalog, billOfMaterial);

    return this.buildGraph(modules)
  }

  async buildFromModules(modules: SingleModuleVersion[]): Promise<DotGraph> {
    return this.buildGraph(modules)
  }

  buildGraph(modules: SingleModuleVersion[]): DotGraph {

    const graph: DotGraph = {nodes: [], direction: 'UP', type: 'digraph'}

    modules.forEach(module => this.processModule(module, graph))

    return graph;
  }

  processModule(module: SingleModuleVersion, graph: DotGraph): DotNode {

    const optionalDotNode: Optional<DotNode> = retrieveNode(graph, module)
    if (optionalDotNode.isPresent()) {
      return optionalDotNode.get()
    }

    const dotNode: DotNode = {
      name: module.alias || module.name,
      type: module.name,
      dependencies: []
    };

    graph.nodes.push(dotNode);

    dotNode.dependencies = arrayOf(module.version?.dependencies)
      .filter(dep => !!dep._module)
      .map(dep => this.processModule(dep._module as any, graph))
      .asArray();

    return dotNode;
  }
}

const nodeId = (node: DotNode): string => `${node.name}-${node.type}`;
const moduleId = (module: SingleModuleVersion): string => `${module.alias || module.name}-${module.name}`;

const retrieveNode = (graph: DotGraph, module: SingleModuleVersion): Optional<DotNode> => {
  return arrayOf(graph.nodes).filter(node => nodeId(node) === moduleId(module)).first();
}
