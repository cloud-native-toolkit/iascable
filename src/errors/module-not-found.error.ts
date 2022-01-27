import {Module, ModuleDependency, ModuleOutputRef, SingleModuleVersion} from '../models';

export class ModuleNotFound extends Error {
  constructor(readonly source: string, readonly module?: string) {
    super(`Unable to find module (${module}): ${source}`);
  }
}

export class ModulesNotFound extends Error {
  readonly sources: string[] = [];

  constructor(moduleRefs: Array<{source: string}>) {
    super(`Unable to find module(s): ${moduleRefs.map(m => m.source)}`);

    this.sources = moduleRefs.map(m => m.source);
  }
}

export class ModuleMetadataInvalid extends Error {
  readonly module: Module;

  constructor(message: string, module: Module) {
    super(message);

    this.module = module;
  }
}

export class MultipleMatchingModules extends Error {
  constructor(public readonly module: ModuleId, public readonly dep: ModuleDependency, public readonly matchingModules: Module[]) {
    super(`More than one module resolves dependency for module (${moduleId(module)}): ${dep.id}, ${matchingModules.map(m => m.alias || m.name)}`);
  }
}

export class PreferredModuleNotFound extends Error {
  constructor(public readonly preferred: string, public readonly dep: ModuleDependency, public readonly module: ModuleId) {
    super(`Preferred module not found (dep: ${dep.id}, module: ${moduleId(module)}): ${preferred}`);
  }
}

export class DependencyModuleNotFound extends Error {
  constructor(public readonly dep: ModuleDependency, public readonly module: ModuleId) {
    super(`Dependency module not found (${moduleId(module)}): ${dep.id}-${JSON.stringify(dep.refs)}`);
  }
}

export class NoMatchingModuleVersions extends Error {
  constructor(public readonly dep: ModuleDependency, public readonly module: ModuleId) {
    super(`No available module versions (${moduleId(module)}): ${dep.id}`);
  }
}

export class ModuleDependencyNotFound extends Error {
  constructor(public readonly dep: ModuleOutputRef, public readonly module: ModuleId) {
    super(`Unable to find dependency for output ref (${moduleId(module)}): ${dep.id}.${dep.output}`);
  }
}

export class ModuleDependencyModuleNotFound extends Error {
  constructor(public readonly dep: ModuleDependency, public readonly module: ModuleId) {
    super(`Unable to find module to satisfy module dependency (${moduleId(module)}): ${dep.id}`);
  }
}

export interface ModuleId {
  alias?: string
  name: string
}

const moduleId = (module: ModuleId): string => {
  return module.alias || module.name
}
