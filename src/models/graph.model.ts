import {OutputFile, OutputFileType} from './file.model';

export interface DotGraph {
  type: string;
  rankdir: string;
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

  contents(): Promise<string | Buffer> {
    return Promise.resolve(graphToString(this.dotGraph))
  }
}

export const graphToString = (graph: DotGraph): string => {
  const nodes: string[] = graph.nodes.reduce((result: string[], node: DotNode) => {
    const nodes: string[] = Array.from(new Set(node.dependencies.map(dep => `"${nodeId(node)}" -> "${nodeId(dep)}"`)))

    result.push(...nodes)
    result.push(`"${nodeId(node)}"`)

    return result
  }, [])

  return `${graph.type} {
    rankdir="${graph.rankdir}"
    ${nodes.join('\n')}
  }`
}
