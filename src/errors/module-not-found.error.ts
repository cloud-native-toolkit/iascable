
export class ModuleNotFound extends Error {
  constructor(readonly source: string) {
    super(`Unable to find module: ${source}`);
  }
}

export class ModulesNotFound extends Error {
  readonly sources: string[] = [];

  constructor(moduleRefs: Array<{source: string}>) {
    super(`Unable to find module(s): ${moduleRefs.map(m => m.source)}`);

    this.sources = moduleRefs.map(m => m.source);
  }
}
