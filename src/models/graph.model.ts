import {OutputFile, OutputFileType} from './file.model';

export interface DotGraph {
  type: string;
  direction: string;
  nodes: DotNode[];
}

export interface DotNode {
  name: string;
  type: string;
  dependencies: DotNode[];
}

const nodeId = (node: DotNode): string => `${node.name} (${node.type})`

export class DotGraphFile implements OutputFile {
  name: string = 'dependencies.dot';
  type = OutputFileType.dotGraph;

  constructor(public dotGraph: DotGraph) {}

  get contents(): Promise<string | Buffer> {
    return Promise.resolve(graphToString(this.dotGraph))
  }
}

export const graphToString = (graph: DotGraph): string => {
  const nodes: string[] = graph.nodes.reduce((result: string[], node: DotNode) => {
    node.dependencies.forEach(dep => {
      result.push(`  "${nodeId(node)}" -> "${nodeId(dep)}"`)
    })

    return result
  }, [])

  return `${graph.type} {
    ${nodes.join('\n')}
  }`
}
