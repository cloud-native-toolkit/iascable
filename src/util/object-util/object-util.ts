
export function isUndefined(value: any): value is undefined {
  return value === undefined;
}

export function isUndefinedOrEmpty(value: any): boolean {
  return value === undefined || (Array.isArray(value) && value.length === 0);
}

export function isUndefinedOrNull(value: any): boolean {
  return value === undefined || value === null;
}

export function isDefined(value: any): boolean {
  return value !== undefined;
}

export function isDefinedAndNotNull(value: any): boolean {
  return value !== undefined && value !== null;
}

export function omit<T, U extends keyof T>(value: T, field: U): Omit<T, U> {
  const c: T = Object.assign({}, value);

  delete c[field];

  return c;
}
