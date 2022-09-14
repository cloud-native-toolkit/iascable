import {Module, ModuleDependency, ModuleOutputRef, SingleModuleVersion} from '../models';

export class ModuleNotFound extends Error {
  constructor(readonly source: string | string[], readonly module?: string) {
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
    super(`More than one module resolves dependency for module: module=${moduleId(module)}, ${dependencyString(dep)}, matchingModules=${matchingModules.map(m => m.alias || m.name)}`);
  }
}

export class PreferredModuleNotFound extends Error {
  constructor(public readonly preferred: string, public readonly dep: ModuleDependency, public readonly module: ModuleId) {
    super(`Preferred module not found: module=${moduleId(module)}, dependency=${dep.id}, preferred=${preferred}`);
  }
}

export class DependencyModuleNotFound extends Error {
  constructor(public readonly dep: ModuleDependency, public readonly module: ModuleId) {
    super(`Dependent module not found: module=${moduleId(module)}, ${dependencyString(dep)}`);
  }
}

export class NoMatchingModuleVersions extends Error {
  constructor(public readonly dep: ModuleDependency, public readonly module: ModuleId) {
    super(`No available module versions: module=${moduleId(module)}, ${dependencyString(dep)}`);
  }
}

export class ModuleDependencyNotFound extends Error {
  constructor(public readonly dep: ModuleOutputRef, public readonly module: ModuleId) {
    super(`Unable to find dependency for output ref: module=${moduleId(module)}, ${dep.id}.${dep.output}`);
  }
}

export class ModuleDependencyModuleNotFound extends Error {
  constructor(public readonly dep: ModuleDependency, public readonly module: ModuleId) {
    super(`Unable to find module to satisfy module dependency: module=${moduleId(module)}, ${dependencyString(dep)}`);
  }
}

export interface ModuleId {
  alias?: string
  name: string
}

const moduleId = (module: ModuleId): string => {
  return module.alias || module.name
}

const dependencyString = (dep: ModuleDependency): string => {
  const refs: string = dep.interface ? `interface=${dep.interface}` : `refs=${JSON.stringify(dep.refs)}`

  return `dependency=${dep.id}, ${refs}`
}
