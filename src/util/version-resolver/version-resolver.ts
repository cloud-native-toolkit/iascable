import {compareVersions, compare, CompareOperator} from 'compare-versions';

import {concat} from '../array-util';
import {VersionComparison, versionComparisonFromString, VersionMatcher} from '../../models';

export class IncompatibleVersions extends Error {
  constructor(public readonly versions: VersionMatcher[]) {
    super('Versions are incompatible: ' + JSON.stringify(versions));
  }
}

export class ModuleVersionNotFound extends Error {
  constructor(readonly module: {id: string}, readonly version: string | VersionMatcher[]) {
    super(`Unable to find version ${JSON.stringify(version)} for module: ${module.id}`);
  }
}

export const parseVersionMatcher = (versionPattern: string | VersionMatcher[]): VersionMatcher[] => {
  if (Array.isArray(versionPattern)) {
    return versionPattern;
  }

  const rangeRegEx = /(\d+[.]\d+[.]\d+) - (\d+[.]\d+[.]\d+)/;
  if (rangeRegEx.test(versionPattern)) {
    const firstVersion = versionPattern.replace(rangeRegEx, '$1');
    const secondVersion = versionPattern.replace(rangeRegEx, '$2');

    return [{
      version: firstVersion,
      comparator: VersionComparison.gte,
    }, {
      version: secondVersion,
      comparator: VersionComparison.lte,
    }];
  }

  const version: string = versionPattern.replace(/.*(\d+[.]\d+[.]\d+)/, '$1');
  const comparator: string = versionPattern.replace(version, '').trim();

  return [{
    version,
    comparator: versionComparisonFromString(comparator),
  }];
}

export function asCompareOperator(comparator: VersionComparison): CompareOperator {
  if (comparator === VersionComparison.major || comparator === VersionComparison.minor) {
    return '>=';
  }

  return comparator;
}

export function findUnionOfMatchers(baseMatchers: VersionMatcher[], newMatchers: VersionMatcher[]): VersionMatcher[] {
  if (!baseMatchers || baseMatchers.length === 0) {
    return newMatchers;
  }

  const results: VersionMatcher[] = [];

  const matchers: VersionMatcher[] = concat([], baseMatchers, newMatchers);

  const eqMatchers: VersionMatcher[] = matchers
    .filter(m => (m.comparator === VersionComparison.eq))
    .reduce((result: VersionMatcher[], current: VersionMatcher) => {
      if (!result.some(v => v.version === current.version)) {
        result.push(current);
      }

      return result;
    }, []);

  if (eqMatchers.length > 1) {
    throw new IncompatibleVersions(eqMatchers);
  } else if (eqMatchers.length > 0) {
    const matcher = eqMatchers[0];

    const incompatible: VersionMatcher[] = matchers
      .filter(m => (m.comparator !== VersionComparison.eq))
      .filter(m => compare(m.version, matcher.version, asCompareOperator(m.comparator)))

    if (incompatible.length > 0) {
      throw new IncompatibleVersions(concat([], eqMatchers, incompatible));
    }

    return eqMatchers;
  }

  const gtMatchers: VersionMatcher[] = matchers
    .filter(m => (m.comparator === VersionComparison.gt || m.comparator === VersionComparison.gte))
    .sort((a: VersionMatcher, b: VersionMatcher) => compareVersions(a.version, b.version)*-1);

  if (gtMatchers.length > 0) {
    results.push(gtMatchers[0]);
  }

  const ltMatchers: VersionMatcher[] = matchers
    .filter(m => (m.comparator === VersionComparison.lt || m.comparator === VersionComparison.lte))
    .sort((a: VersionMatcher, b: VersionMatcher) => compareVersions(a.version, b.version));

  if (ltMatchers.length > 0) {
    results.push(ltMatchers[0]);
  }

  return results;
}

export const resolveVersions = (versions: Array<string | VersionMatcher[]>): VersionMatcher[] => {
  return versions
    .filter(v => !!v)
    .map(parseVersionMatcher)
    .reduce((result: VersionMatcher[], current: VersionMatcher[]) => {
      return findUnionOfMatchers(result, current);
    }, []);
};

export function findMatchingVersion<T extends {version: string}, M extends {id: string, versions: Array<T>}>(
  module: M,
  matchers: string | VersionMatcher[],
): T {

  const matchingVersions: Array<T> = findMatchingVersions(module, matchers);

  if (matchingVersions.length === 0) {
    throw new ModuleVersionNotFound(module, matchers);
  }

  return matchingVersions[0];
}

export function findMatchingVersions<T extends {version: string}, M extends {id: string, versions: Array<T>}>(
  module: M,
  versionMatchers: string | VersionMatcher[],
): Array<T> {

  const matchers: VersionMatcher[] = parseVersionMatcher(versionMatchers);

  const matchingVersions: Array<T> = module.versions
    .sort((a: T, b: T) => compareVersions(a.version, b.version) * -1)
    .filter(m => matchers.every(v => compare(m.version, v.version, asCompareOperator(v.comparator))));

  return matchingVersions;
}
