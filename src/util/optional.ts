
export class NoSuchElement extends Error {
  constructor(message?: string) {
    super(message);
  }
}

function isNotEmpty<T>(value: T): value is T {
  return value !== undefined && value !== null;
}

export class Optional<T = any> {
  private constructor(public readonly value: T | undefined) {
  }

  static of<T = any>(value?: T): Optional<T> {
    return new Optional(value as T);
  }

  static empty<T = any>(): Optional<T> {
    return new Optional<T>(undefined);
  }

  isPresent(): boolean {
    return this.value !== undefined && this.value !== null;
  }

  ifPresent(f: (value: T) => void) {
    if (this.value !== undefined && this.value !== null) {
      f(this.value);
    }
  }

  get(): T {
    if (this.value === undefined || this.value === null) {
      throw new NoSuchElement('The element does not exist');
    }

    return this.value;
  }

  orElse(defaultValue: T): T {
    if (this.value === undefined || this.value === null) {
      return defaultValue;
    }

    return this.value;
  }

  orElseThrow(err: Error): T {
    if (this.value === undefined || this.value === null) {
      throw err;
    }

    return this.value;
  }

  orElseGet(f: () => T): T {
    if (this.value === undefined || this.value === null) {
      return f();
    }

    return this.value;
  }

  map<U>(f: (value: T) => U): Optional<U> {
    if (this.value !== undefined && this.value !== null) {
      return Optional.of(f(this.value));
    } else {
      return this as any;
    }
  }
}

export function of<T = any>(value?: T): Optional<T> {
  return Optional.of<T>(value);
}

export function empty<T = any>(): Optional<T> {
  return Optional.empty<T>();
}
