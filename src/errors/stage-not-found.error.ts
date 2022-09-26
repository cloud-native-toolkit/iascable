import {Stage} from '../models';

export class StageNotFound extends Error {
  constructor(public readonly stageName: string, public readonly stagesNames: string[]) {
    super(`Unable to find stage with name: ${stageName}: ${stagesNames}`);
  }
}
