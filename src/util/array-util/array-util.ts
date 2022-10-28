import {Optional} from '../optional/optional';
import {isUndefined} from '../object-util/object-util';

export class ArrayUtil<T = any> {
  public readonly value: T[];

  private constructor(value?: T[]) {
    if (value === undefined) {
      this.value = [];
    } else if (!Array.isArray(value)) {
      this.value = [];
    } else {
      this.value = value;
    }
  }

  static of<T>(array?: T[]): ArrayUtil<T> {
    return new ArrayUtil(array);
  }

  filter(f: (value: T, index: number, array: T[]) => boolean): ArrayUtil<T> {
    return new ArrayUtil(this.value.filter(f));
  }

  map<U>(f: (value: T, index: number, array: T[]) => U): ArrayUtil<U> {
    return new ArrayUtil(this.value.map(f));
  }

  mergeMap<U>(): ArrayUtil<U> {
    return new ArrayUtil(this.value.reduce((result: U[], currentValue: T) => {
      if (Array.isArray(currentValue)) {
        result.push(...currentValue);
      } else {
        result.push(currentValue as any);
      }

      return result;
    }, []));
  }

  some(predicate: (value: T, index: number, array: T[]) => boolean): boolean {
    return this.value.some(predicate);
  }

  every(predicate: (value: T, index: number, array: T[]) => boolean): boolean {
    return this.value.every(predicate);
  }

  reduce<U>(f: (result: U, current: T) => U, init: U): U {
    return this.value.reduce(f, init);
  }

  push(...values: T[]): ArrayUtil<T> {
    const vals: T[] = this.value.slice();

    vals.push(...values);

    return new ArrayUtil<T>(vals);
  }

  forEach(f: (value: T, index: number, array: T[]) => void): ArrayUtil<T> {
    this.value.forEach(f);

    return this;
  }

  first(): Optional<T> {
    if (!this.value || this.value.length === 0) {
      return Optional.empty();
    }

    return Optional.of(this.value[0]);
  }

  get length(): number {
    return this.value.length;
  }

  join(separator?: string): string {
    return this.value.join(separator);
  }

  ifEmpty(f: () => T[] | undefined): ArrayUtil {

    if (this.isEmpty()) {
      const result = f();

      if (!isUndefined(result)) {
        return new ArrayUtil(result);
      } else {
        return new ArrayUtil([]);
      }
    }

    return this;
  }

  isEmpty(): boolean {
    return this.value.length === 0;
  }

  asArray(): T[] {
    return this.value;
  }
}

export function arrayOf<T>(array?: T[]): ArrayUtil<T> {
  return ArrayUtil.of(array);
}

export function concat<T>(target: T[], ...toAdd: T[][]): T[] {
  return toAdd.reduce((result: T[], current: T[]) => {
    return result.concat(current);
  }, target);
}
