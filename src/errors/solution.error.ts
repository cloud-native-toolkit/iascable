import {SolutionLayerModel} from '../models/solution.model';

export class SolutionLayerNotFound extends Error {
  constructor(public readonly layer: SolutionLayerModel) {
    super(`Unable to find solution layer: ${layer.name}`);
  }
}

export const isSolutionLayerNotFound = (v: any): v is SolutionLayerNotFound => {
  return !!v && !!v.layer
}

export class SolutionLayersNotFound extends Error {
  readonly layers: SolutionLayerModel[]

  constructor(layers: SolutionLayerNotFound[]) {
    super(`Unable to find solution layers: ${layerNames(layers)}`);

    this.layers = layers.map(l => l.layer)
  }
}

const layerNames = (layers: SolutionLayerNotFound[]) => {
  return layers.map(l => l.layer.name)
}

export class NestedSolutionError extends Error {
  constructor() {
    super(`Solutions of solutions are not currently supported`);
  }
}
