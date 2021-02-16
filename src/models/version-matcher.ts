import {of as arrayOf} from '../util/array-util';
import {isUndefined} from '../util/object-util';

export enum VersionComparison {
  major = '^',
  minor = '~',
  gt = '>',
  gte = '>=',
  lt = '<',
  lte = '<=',
  eq = '='
}

function get(key: string): VersionComparison | undefined {
  const index: number = Object.keys(VersionComparison).indexOf(key);

  if (index < 0) {
    return undefined;
  }

  return Object.values(VersionComparison)[index];
}

export function versionComparisonFromString(value: string): VersionComparison {
  return arrayOf(Object.keys(VersionComparison))
    .filter(key => get(key) === value)
    .map<VersionComparison>(key => get(key) as VersionComparison)
    .filter(comparison => !isUndefined(comparison))
    .first()
    .orElse(VersionComparison.eq);
}

export interface VersionMatcher {
  comparator: VersionComparison;
  version: string;
}
