import {
  CatalogProviderModel, isCatalogProviderModel,
  Module,
  ModuleDependency,
  ModuleProvider,
  ModuleVersion,
  SingleModuleVersion
} from '../../models';
import {
  DependencyModuleNotFound,
  MultipleMatchingModules,
  NoMatchingModuleVersions,
  PreferredModuleNotFound
} from '../../errors';
import {ArrayUtil, of as arrayOf} from '../../util/array-util/array-util';
import {Optional} from '../../util/optional';
import {LoggerApi} from '../../util/logger';
import {Container} from 'typescript-ioc';
import {findMatchingVersions} from '../../util/version-resolver';
import deepClone from 'lodash.clonedeep';
import {Catalog} from '../../model-impls/catalog.impl';

export const resolveSelectedModules = (fullCatalog: Catalog, modules: Module[]): SingleModuleVersion[] => {
  return new SelectedModuleResolverImpl(fullCatalog).resolve(modules);
}

export interface SelectedModulesResolver {
  resolve(modules: Module[]): SingleModuleVersion[];
}

export interface SelectedModuleResolverConfig {
  strict?: boolean
}

export class SelectedModuleResolverImpl implements SelectedModulesResolver {
  logger: LoggerApi
  strict: boolean = true

  constructor(private readonly catalog: Catalog, {strict = true}: SelectedModuleResolverConfig = {}) {
    this.strict = strict

    this.logger = Container.get(LoggerApi)
  }

  resolve(modules: Module[]): SingleModuleVersion[] {

    const updatedModules: Module[] = modules.map(updateAliasForDuplicateModules)

    const modulesWithFilteredVersions: Module[] = this.resolveDependencies(updatedModules)

    const modulesWithDependencies: Module[] = this.resolveDependencies(modulesWithFilteredVersions)

    const singleModuleVersions: SingleModuleVersion[] = modulesWithDependencies.map(module => {
      const version: ModuleVersion = arrayOf(module.versions).first().get()

      return Object.assign({}, module, {version, versions: []})
    })

    return singleModuleVersions;
  }

  resolveDependencies(modules: Module[]): Module[] {
    return modules.reduce((modules: Module[], currentModule: Module) => {
      return this.resolveModuleDependencies(modules, currentModule)
    }, modules.slice())
  }

  resolveModuleDependencies(modules: Module[], module: Module): Module[] {
    if (!module.versions || module.versions.length === 0) {
      return modules
    }

    const moduleVersion: ModuleVersion = module.versions[0]

    this.logger.debug('Resolving module dependencies: ', {module, moduleVersion})

    const providers: Array<ModuleProvider | CatalogProviderModel> = this.getProviders(moduleVersion)
    moduleVersion.providers = providers

    const providerDependencies: ModuleDependency[] = this.getProviderDependencies(providers)

    const moduleDependencies: ArrayUtil<ModuleDependency> = arrayOf(moduleVersion.dependencies)
      .push(...providerDependencies);

    if (moduleDependencies.isEmpty()) {
      return modules
    }

    const modulesWithDependencies: Module[] = moduleDependencies
      .reduce((result: Module[], originalDep: ModuleDependency) => {

        const dep: ModuleDependency = updateDepFromBom(originalDep, module)
        if (dep._module) {
          return result
        }

        this.logger.debug('Resolving dependency: ', {dep, module})
        const matchingModule: Module | Module[] | undefined = this.findDependencyInModules(result, dep, module)
        if (matchingModule) {
          const updatedModule = filterModuleVersions(dep, matchingModule)

          validateAvailableModuleVersions(dep, updatedModule)

          dep._module = updatedModule
          return result
        } else {
          this.logger.debug('Module not found in existing module set: ', {dep})
        }

        if (!dep.optional) {
          const newModule: Module = this.findDependencyInCatalog(dep, module);

          const updatedModule: Module = Object.assign(
            {},
            newModule,
            dep.discriminator && dep.discriminator !== '*' ? {alias: dep.discriminator} : {})

          const filteredModule: Module = filterModuleVersions(dep, updatedModule) as Module

          if (!filteredModule.versions || filteredModule.versions.length === 0) {
            throw new NoMatchingModuleVersions(dep, filteredModule)
          }

          this.logger.debug('Module found in catalog: ', {dep, filteredModule})

          dep._module = filteredModule
          result.push(filteredModule)

          return this.resolveModuleDependencies(result, filteredModule)
        }

        return result
      }, modules.slice())

    return modulesWithDependencies
  }

  getProviders(moduleVersion: ModuleVersion): Array<ModuleProvider | CatalogProviderModel> {

    return arrayOf(moduleVersion.providers)
      .map<ModuleProvider | CatalogProviderModel>((p: ModuleProvider) => {
        return this.catalog.lookupProvider(p).orElse(p as any)
      })
      .asArray()
  }

  getProviderDependencies(moduleProviders: Array<ModuleProvider | CatalogProviderModel>): ModuleDependency[] {

    return arrayOf(moduleProviders)
      .map((p: ModuleProvider | CatalogProviderModel) => isCatalogProviderModel(p) ? p.dependencies : [])
      .mergeMap<ModuleDependency>()
      .asArray()
  }

  findDependencyInModules(modules: Module[], dep: ModuleDependency, containingModule: Module): Module | Module[] | undefined {
    const matches: Module[] = modules
      .filter(m => {
        // don't match a module against itself
        if (m === containingModule) {
          return false
        }

        if (dep.discriminator) {
          return matchAlias(dep, m) && (matchInterface(dep, m) || matchRefs(dep, m, this.catalog))
        }

        return matchInterface(dep, m) || matchRefs(dep, m, this.catalog)
      })

    if (!dep.discriminator && dep.manualResolution) {
      this.logger.debug('No discriminator provided for dependency that requires manual resolution', {dep})

      return undefined
    }

    if (dep.discriminator !== '*' && matches.length > 1 && this.strict) {
      const isDefault = (m: Module) => (!!m.alias && m.alias === m.originalAlias) || !!m.default

      const defaultAlias: Module[] = matches.filter(isDefault)
      if (defaultAlias.length === 1) {
        return defaultAlias[0]
      }

      throw new MultipleMatchingModules(containingModule, dep, defaultAlias.length > 0 ? defaultAlias : matches)
    }

    if (dep.discriminator === '*' && matches.length > 1) {
      return matches;
    }

    if (matches.length > 0) {
      return matches[0]
    }

    return undefined;
  }

  findDependencyInCatalog(dep: ModuleDependency, containingModule: Module): Module {

    const modules: Module[] = this.lookupModulesFromDependency(dep)

    if (modules.length > 1 && this.strict) {
      throw new MultipleMatchingModules(containingModule, dep, modules)
    }

    if (modules.length > 1 && dep.preferred) {
      const preferredModule: Optional<Module> = arrayOf(modules)
        .filter(m => this.catalog.getModuleId(m.id) === this.catalog.getModuleId(dep.preferred || ''))
        .first()
        .map(deepClone)

      return preferredModule.orElseThrow(new PreferredModuleNotFound(dep.preferred, dep, containingModule))
    }

    if (modules.length > 0) {
      return deepClone(modules[0])
    }

    throw new DependencyModuleNotFound(dep, containingModule)
  }

  lookupModulesFromDependency(dep: ModuleDependency): Module[] {
    if (dep.interface) {
      return this.catalog.findModulesWithInterface(dep.interface)
    }

    if (dep.refs) {
      return dep.refs
        .map(ref => this.catalog.lookupModule({id: ref.source}))
        .filter(m => !!m) as any
    }

    return []
  }
}

export const updateAliasForDuplicateModules = (targetModule: Module, index: number, modules: Module[]): Module => {
  const nameIndexes = modules
    .map((m: Module, i: number) => getModuleKey(m) === getModuleKey(targetModule) ? i : -1)
    .filter(i => i >= 0);

  if (nameIndexes.length === 1 || nameIndexes.indexOf(index) === 0) {
    if (!targetModule.alias) {
      return Object.assign({}, targetModule, {alias: targetModule.name})
    }

    return targetModule
  }

  const alias: string = `${getModuleKey(targetModule)}${nameIndexes.indexOf(index)}`

  return Object.assign({}, targetModule, {alias})
}

export const getModuleKey = (module: Module): string => {
  return module.alias || module.name
}

export const matchInterface = (dep: ModuleDependency, module: Module): boolean => {
  const interfaces: string[] = (module.interfaces || [])

  return !!(dep.interface && interfaces.includes(dep.interface));
}

export const matchRefs = (dep: ModuleDependency, module: Module, catalog: Catalog): boolean => {
  const refIds: string[] = (dep.refs || [])
    .map(ref => ref.source)
    .map(source => catalog.getModuleId(source))

  const match: boolean = refIds
    .includes(module.id.replace(/.git$/, ''))

  return match
}

export const matchAlias = (dep: ModuleDependency, module: Module): boolean => {
  if (!dep.discriminator) {
    return false
  }

  return (dep.discriminator === '*') || (dep.discriminator === module.alias) || (dep.discriminator === module.name)
}

export const filterModuleVersions = (dep: ModuleDependency, moduleInput: Module | Module[]): Module | Module[] => {

  const modules: Module[] = !Array.isArray(moduleInput) ? [moduleInput] : moduleInput

  const result: Module[] = modules.map(m => {

    if (dep.interface && (m.interfaces || []).includes(dep.interface)) {
      // module versioning does not apply to interfaces
      return m
    }

    const versionString: Optional<string> = arrayOf(dep.refs)
      .filter(ref => ref.source === m.id)
      .first()
      .map(ref => ref.version as string)

    if (!versionString.isPresent()) {
      return m
    }

    m.versions = findMatchingVersions(m, versionString.get())

    return m
  })

  return !Array.isArray(moduleInput) ? result[0] : result
}

export const updateDepFromBom = (dep: ModuleDependency, module: Module): ModuleDependency => {
  const depUpdate: Partial<ModuleDependency> = arrayOf(module.bomModule?.dependencies)
    .filter(d => d.name === dep.id || d.id === dep.id)
    .first()
    .map(bomDep => {
      return Object.assign(
        bomDep.ref ? {discriminator: bomDep.ref} : {},
        bomDep.optional !== undefined ? {optional: bomDep.optional} : {}
      )
    })
    .orElse({})

  return Object.assign(dep, depUpdate)
}

export const validateAvailableModuleVersions = (dep: ModuleDependency, moduleInput: Module | Module[]) => {
  const module: Module[] = !Array.isArray(moduleInput) ? [moduleInput] : moduleInput

  module.forEach(m => {
    if (!m.versions || m.versions.length === 0) {
      throw new NoMatchingModuleVersions(dep, m)
    }
  })
}
