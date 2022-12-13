import {Inject} from 'typescript-ioc';

import {DependencyGraphApi} from './dependency-graph.api';
import {
  BillOfMaterialModel,
  DotGraph,
  DotNode,
  ModuleDependency,
  ModuleVersion,
  SingleModuleVersion
} from '../../models';
import {arrayOf, Optional} from '../../util';
import {CatalogLoaderApi} from '../catalog-loader';
import {ModuleSelectorApi} from '../module-selector';
import {Catalog} from '../../model-impls';

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

    const graph: DotGraph = {nodes: [], rankdir: 'BT', type: 'digraph'}

    modules.forEach(module => this.processModule(module, graph, modules))

    return graph;
  }

  processModule(module: SingleModuleVersion, graph: DotGraph, modules: SingleModuleVersion[]): DotNode {

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

    const version: ModuleVersion | undefined = lookupVersion(module)
    dotNode.dependencies = arrayOf(version?.dependencies)
      .map(dep => {
        if (dep._module) {
          return dep._module
        }

        return lookupModule(dep, module, modules).orElse(undefined as any)
      })
      .filter(module => !!module)
      .map(module => this.processModule(module as any, graph, modules))
      .asArray();

    return dotNode;
  }
}

const lookupVersion = (module: any): ModuleVersion | undefined => {
  if (module.version) {
    return module.version
  }

  if (module.versions && module.versions.length > 0) {
    return module.versions[0]
  }

  return undefined
}

const lookupModule = (dep: ModuleDependency, parentModule: SingleModuleVersion, modules: SingleModuleVersion[]): Optional<SingleModuleVersion> => {
  return arrayOf(modules)
    .filter(module => {
      if (dep.interface) {
        if (/.*#sync/g.test(dep.interface)) {
          return false
        }

        return ((module.interfaces || []).includes(dep.interface) && module !== parentModule)
      }

      return (dep.refs || []).map(ref => ref.source).includes(module.id)
    })
    .first()
}

const nodeId = (node: DotNode): string => `${node.name}-${node.type}`;
const moduleId = (module: SingleModuleVersion): string => `${module.alias || module.name}-${module.name}`;

const retrieveNode = (graph: DotGraph, module: SingleModuleVersion): Optional<DotNode> => {
  return arrayOf(graph.nodes).filter(node => nodeId(node) === moduleId(module)).first();
}
