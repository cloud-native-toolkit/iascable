import {Container} from 'typescript-ioc';

import {LoggerApi} from '../../util/logger';
import {findMatchingVersion, resolveVersions} from '../../util/version-resolver';
import {
  BillOfMaterialModuleDependency,
  Catalog,
  isModule,
  Module,
  ModuleDependency,
  ModuleMatcher,
  ModuleRef,
  ModuleVersion,
  SingleModuleVersion
} from '../../models';
import {ModuleNotFound, ModulesNotFound} from '../../errors';
import {Optional} from '../../util/optional';
import {ArrayUtil, of as arrayOf} from '../../util/array-util';

export class SelectedModules {
  readonly modules: {[source: string]: Module} = {};
  readonly moduleRefs: {[name: string]: ModuleRef[]} = {};
  readonly missingModules: ModuleRef[] = [];
  readonly logger: LoggerApi;

  constructor(public readonly catalog: Catalog, ...modules: Module[]) {
    modules.forEach(m => this.addModule(m));
    this.logger = Container.get(LoggerApi).child('SelectedModules');
  }

  addModule(module: Module, bom?: boolean): SelectedModules {
    if (module) {
      const moduleKey: string = getModuleKey(module, Object.keys(this.modules), bom);

      this.modules[moduleKey] = module;
      this.addModuleRef({source: module.id});
    } else {
      this.logger.error('Adding empty module!!');
    }

    return this;
  }

  containsModule(module: Module | ModuleRef, discriminator?: string): boolean {
    return containsModule(this.modules, module, discriminator);
  }

  addModuleRef(moduleRef: ModuleRef): SelectedModules {
    if (moduleRef) {
      const id = moduleRef.source;

      const refs = this.moduleRefs[id] ? this.moduleRefs[id] : [];

      refs.push(moduleRef);

      this.moduleRefs[id] = refs;
    }

    return this;
  }

  getCatalogModule(moduleRef: {source: string}): Module {
    if (!moduleRef) {
      throw new ModuleNotFound('<not provided>');
    }

    const modules: Module[] = this.catalog.modules
      .filter(m => {
        const ids: string[] = [m.id, ...(m.aliasIds || [])];

        const match = ids.includes(moduleRef.source);

        return match;
      });

    if (modules.length === 0) {
      throw new ModuleNotFound(moduleRef.source);
    }

    return modules[0];
  }

  addMissingModule(moduleRef: ModuleRef): SelectedModules {
    if (moduleRef) {
      this.missingModules.push(moduleRef);
    }

    return this;
  }

  resolveModules(modules: Module[]): SingleModuleVersion[] {
    modules.forEach(m => this.resolveModuleDependencies(m, modules, true));

    if (this.hasMissingModules()) {
      throw new ModulesNotFound(this.missingModules);
    }

    return this.resolveModuleVersions();
  }

  resolveModuleDependencies(module: Module, modules: Module[], bom: boolean = false) {
    this.logger.debug('Adding module: ', bom, module.id);
    this.addModule(module, bom);
    this.logger.debug('  Added modules: ', Object.keys(this.modules));
    this.logger.debug('  Added moduleRefs: ', Object.keys(this.moduleRefs));

    const dependencies: ArrayUtil<ModuleDependency> = arrayOf(module.versions[0].dependencies);
    this.logger.debug('Modules: ', {module: module.name, dependencies});

    const updateDiscriminatorFromModule: (dep: ModuleDependency) => ModuleDependency = (dep: ModuleDependency) => {
      if (!dep || !dep.refs || dep.refs.length === 0) {
        return dep;
      }

      const module: Module = this.getCatalogModule(dep.refs[0]);
      if (!module) {
        return dep;
      }

      return Object.assign({}, dep, {discriminator: module.alias || module.name});
    };

    const updateDiscriminatorFromBOM: (dep: ModuleDependency) => ModuleDependency = (dep: ModuleDependency) => {

      const bomModuleDep: Optional<ModuleDependency> = arrayOf(module.bomModule?.dependencies)
        .filter((bomDep: BillOfMaterialModuleDependency) => bomDep.name === dep.id)
        .first()
        .map(bomDep => Object.assign({}, dep, {discriminator: bomDep.ref}));

      return bomModuleDep.orElse(dep);
    };

    const updatedDependencies: ArrayUtil<ModuleDependency> = dependencies
      .map(updateDiscriminatorFromModule)
      .map(updateDiscriminatorFromBOM)
      .forEach(dep => this.resolveModuleDependency(dep, module.id, modules));

    const mutateModuleBomDiscriminators = (originalModule: Module, updatedDeps: ArrayUtil<ModuleDependency>) => {
      const bomModule = originalModule.bomModule;
      if (!bomModule || updatedDeps.length === 0) {
        return;
      }

      updatedDeps.forEach(updatedDep => {
        const optionalBomDep = arrayOf(bomModule.dependencies)
          .filter(d => d.name === updatedDep.id)
          .first();

        if (!optionalBomDep.isPresent()) {
          const bomDep: BillOfMaterialModuleDependency = {
            name: updatedDep.id,
            ref: updatedDep.discriminator || updatedDep.id,
          };

          const bomModuleDeps: BillOfMaterialModuleDependency[] = bomModule.dependencies || [];
          bomModuleDeps.push(bomDep);
          bomModule.dependencies = bomModuleDeps;
        }
      });
    };

    mutateModuleBomDiscriminators(module, updatedDependencies);
  }

  resolveModuleDependency(dep: ModuleDependency, moduleId: string, modules: Module[]) {
    if (!dep || !dep.refs || dep.refs.length === 0) {
      return;
    }

    const moduleRefs: ArrayUtil<ModuleRef> = arrayOf(dep.refs)
      .filter(ref => !!this.getCatalogModule(ref))
      .filter((ref, index, arr) => arr.length === 1 || this.containsModule(ref) || containsModules(modules, ref));

    this.logger.debug('Dependent module refs: ', {moduleRefs: moduleRefs.asArray()});

    if (moduleRefs.length > 1) {
      throw new Error('dependent module selection is not yet supported');
    }

    const firstModuleRef: Optional<ModuleRef> = moduleRefs.first();

    if (firstModuleRef.isPresent() || !dep.optional) {
      const moduleRef: ModuleRef = firstModuleRef.orElseThrow(
        new Error(`Unable to find dependent module(s) (${moduleId}): ${dep.refs.map(r => r.source)}`)
      );

      if (!this.containsModule(moduleRef, dep.discriminator)) {
        try {
          const depModule: Module = this.getCatalogModule(moduleRef);

          const depDiscriminator: string = dep.discriminator || depModule.alias || depModule.name;

          this.resolveModuleDependencies(
            Object.assign({}, depModule, {alias: depDiscriminator}),
            modules,
          );
        } catch (error) {
          if (!dep.optional) {
            this.addMissingModule(moduleRef);
          }
        }
      }

      this.addModuleRef(moduleRef);
    }
  }

  hasMissingModules(): boolean {
    return this.missingModules.length > 0;
  }

  reconcileModuleRefs(): {[source: string]: ModuleMatcher} {

    return Object.keys(this.moduleRefs).reduce((moduleRefs: {[source: string]: ModuleMatcher}, source: string) => {
      const refs = this.moduleRefs[source];

      moduleRefs[source] = {source, version: resolveVersions(refs.map(r => r.version).filter(v => !!v) as string[])};

      return moduleRefs;
    }, {})
  }

  resolveModuleVersions(): SingleModuleVersion[] {
    const matchers: {[source: string]: ModuleMatcher} = this.reconcileModuleRefs();

    return Object.keys(this.modules).map(alias => {
      const module: Module = this.modules[alias];

      const matcher = matchers[module.id];

      const version: ModuleVersion = findMatchingVersion(module, matcher.version);

      const updatedVersion: ModuleVersion = mergeBomDependencyDiscriminators(version, module.bomModule?.dependencies);

      return Object.assign({}, module, {version: updatedVersion, alias});
    })
  }
}

function mergeBomDependencyDiscriminators(version: ModuleVersion, dependencies?: BillOfMaterialModuleDependency[]): ModuleVersion {
  const bomDeps: ArrayUtil<BillOfMaterialModuleDependency> = arrayOf<BillOfMaterialModuleDependency>(dependencies);

  if (bomDeps.length === 0) {
    return version;
  }

  const updatedDependencies: ModuleDependency[] = arrayOf(version.dependencies)
    .map(d => {
      const discriminator: Optional<string> = bomDeps
        .filter(bomDep => bomDep.name === d.id)
        .map(bomDep => bomDep.ref)
        .first();

      return Object.assign({}, d, {discriminator: discriminator.orElse(d.discriminator as any)});
    })
    .asArray();

  return Object.assign({}, version, {dependencies: updatedDependencies});
}

function getModuleKey(module: Module, moduleKeys: string[], bom: boolean = false): string {
  return module.alias || module.name;
}

function getModuleDependencies(module: Module): ModuleDependency[] {
  const moduleVersion: Optional<ModuleVersion> = arrayOf(module.versions)
    .first();

  if (!moduleVersion.isPresent()) {
    return [];
  }

  return (moduleVersion.get().dependencies || []);
}

function dependenciesContainModule(dependencies: ModuleDependency[], module: Module): boolean {
  return dependencies
    .reduce((result: string[], dep: ModuleDependency) => {
      const sources: string[] = dep.refs.map(m => m.source);

      result.push(...sources);

      return result;
    }, [])
    .includes(module.id);
}

function containsModules(modules: Module[], module: Module | ModuleRef, discriminator?: string): boolean {
  const moduleMap: {[source: string]: Module} = modules
    .reduce((result: {[source: string]: Module}, m: Module) => {
      const moduleName: string = m.alias || m.name;

      result[moduleName] = m;

      return result;
    }, {})

  return containsModule(moduleMap, module, discriminator);
}

function containsModule(modules: {[moduleName: string]: Module}, module: Module | ModuleRef, discriminator?: string): boolean {
  if (!module) {
    return false;
  }

  const moduleName: string | undefined = isModule(module) ? module.alias || module.name : discriminator;
  if (moduleName) {
    return !!modules[moduleName];
  } else {
    const ref: string = isModule(module) ? module.id : module.source;

    return Object.values(modules).some((m: Module) => {
      const ids = [m.id, ...(m.aliasIds || [])];

      return ids.includes(ref);
    });
  }
}
