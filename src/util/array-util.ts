import {Optional} from './optional';

export class ArrayUtil<T = any> {
  public readonly value: T[];

  private constructor(value?: T[]) {
    if (value === undefined) {
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

  reduce<U>(f: (result: U, current: T) => U, init: U): U {
    return this.value.reduce(f, init);
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

  asArray(): T[] {
    return this.value;
  }
}

export function first<T>(array?: T[]): Optional<T> {
  return ArrayUtil.of(array).first();
}

export function of<T>(array?: T[]): ArrayUtil<T> {
  return ArrayUtil.of(array);
}

export function concat<T>(target: T[], ...toAdd: T[][]): T[] {
  return toAdd.reduce((result: T[], current: T[]) => {
    return result.concat(current);
  }, target);
}
