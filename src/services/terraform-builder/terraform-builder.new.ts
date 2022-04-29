import {TerraformBuilderApi} from './terraform-builder.api';
import {
  BaseVariable,
  BillOfMaterialModel,
  BillOfMaterialModule,
  BillOfMaterialModuleVariable,
  BillOfMaterialProvider,
  BillOfMaterialVariable,
  IBaseVariable,
  IPlaceholderVariable,
  isPlaceholderVariable,
  isSingleModuleVersion,
  Module,
  ModuleDependency,
  ModuleOutputRef,
  ModuleProvider,
  ModuleRefVariable,
  ModuleVariable,
  PlaceholderVariable,
  SingleModuleVersion,
  Stage,
  StageImpl,
  TerraformComponent,
  TerraformProvider,
  TerraformProviderImpl
} from '../../models';
import {ModuleDependencyModuleNotFound, ModuleDependencyNotFound} from '../../errors';
import {ArrayUtil, of as arrayOf} from '../../util/array-util'
import {isDefined, isDefinedAndNotNull, isUndefinedOrNull} from '../../util/object-util';
import {Optional} from '../../util/optional';

interface TerraformResult {
  stages: {[name: string]: Stage}
  baseVariables: IBaseVariable[],
  providers: TerraformProvider[]
}

const extractProvidersFromModule = (module: SingleModuleVersion, {stages, providers}: {stages: {[name: string]: {name: string}}, providers: TerraformProvider[]}, bomProviders: BillOfMaterialProvider[] = []): {providers: TerraformProvider[], providerVariables: BaseVariable[]} => {

  return (module.version.providers || [])
    .map(mergeBomProvider(bomProviders))
    .reduce(
      (result: {providers: TerraformProvider[], providerVariables: BaseVariable[]}, provider: ModuleProvider) => {

        const variables: BaseVariable[] = (provider.variables || []).map(mapModuleVariable(provider))

        if (!providers.map(buildProviderId).includes(buildProviderId(provider))) {
          const terraformProvider: TerraformProvider = new TerraformProviderImpl({
            name: provider.name,
            alias: provider.alias,
            source: provider.source,
            variables
          }, stages)

          result.providers.push(terraformProvider)
          result.providerVariables.push(...variables)
        }

        return result
      },
      {providers: [], providerVariables: []}
    )
}

const buildProviderId = (provider: {name: string, alias?: string}): string => {
  return provider.alias ? `${provider.name}-${provider.alias}` : provider.name
}

export class TerraformBuilderNew implements TerraformBuilderApi {
  async buildTerraformComponent(modules: SingleModuleVersion[], billOfMaterial?: BillOfMaterialModel): Promise<TerraformComponent> {

    const terraform: TerraformResult = modules.reduce(
      (result: TerraformResult, module: SingleModuleVersion) => {
        const stageVariables: BaseVariable[] = this.moduleVariablesToStageVariables(module)
        const {providers, providerVariables} = extractProvidersFromModule(module, result, billOfMaterial?.spec.providers)

        const stage: Stage = new StageImpl({
          name: componentName(module),
          source: module.id,
          module,
          variables: stageVariables,
        });

        result.stages[stage.name] = stage
        result.baseVariables.push(...stageVariables)

        result.providers.push(...providers)
        result.baseVariables.push(...providerVariables)

        return result
      },
      {stages: {}, baseVariables: [], providers: []}
    )

    const baseVariables: IBaseVariable[] = this.processBaseVariables(terraform.baseVariables, billOfMaterial?.spec.variables)

    const name: string | undefined = billOfMaterial?.metadata.name;
    return new TerraformComponent({
      stages: terraform.stages,
      baseVariables,
      providers: terraform.providers,
      modules,
      bomVariables: billOfMaterial?.spec.variables,
      billOfMaterial,
      files: []
    }, name);
  }

  moduleVariablesToStageVariables(module: SingleModuleVersion): BaseVariable[] {

    const stageVariables: BaseVariable[] = module.version.variables
      .map(mergeBomVariables(arrayOf(module.bomModule?.variables)))
      .map(mapModuleVariable(module))
      .filter(isDefinedAndNotNull)

    return stageVariables
  }

  processBaseVariables(variables: IBaseVariable[], billOfMaterialVariables: BillOfMaterialVariable[] = []): IBaseVariable[] {

    return variables
      .map(mergeBomVariablesIntoBaseVariable(billOfMaterialVariables))
      .reduce((variables: IBaseVariable[], variable: IBaseVariable) => {
        if (!isPlaceholderVariable(variable)) {
          return variables
        }

        if (variable.scope === 'ignore' && variable.defaultValue) {
          return variables
        }

        const globalVariable: IBaseVariable = arrayOf(variables)
          .filter(v => v.name === buildGlobalVariableName(variable))
          .first()
          .orElseGet(createNewGlobalVariableAndAddToList(variables, variable))

        // set the name of the global variable in the stage variable
        variable.variableName = globalVariable.name

        return variables
      }, [])
  }
}

const componentName = (module: {alias?: string, name: string}): string => {
  return module.alias || module.name
}

const moduleRef = (module: {alias?: string, name: string}): {stageName: string} => {
  return {stageName: componentName(module)}
}

const findModuleDependency = (ref: ModuleOutputRef, module: {dependencies?: ModuleDependency[]}, parent: {name: string, alias?: string}): ModuleDependency => {
  const result: Optional<ModuleDependency> = arrayOf(module.dependencies)
    .filter(dep => dep.id === ref.id)
    .first()

  return result.orElseThrow(new ModuleDependencyNotFound(ref, parent))
}

const mergeBomVariables = (bomVariables: ArrayUtil<BillOfMaterialModuleVariable>) => {
  return (variable: ModuleVariable): ModuleVariable => {
    const optionalBomVariable: Optional<BillOfMaterialModuleVariable> = bomVariables
      .filter(v => v.name === variable.name)
      .first();

    if (!optionalBomVariable.isPresent()) {
      return variable;
    }

    const bomVariable: BillOfMaterialModuleVariable = optionalBomVariable.get();

    return Object.assign(
      {},
      variable,
      bomVariable,
      {
        default: isDefined(bomVariable.value) ? bomVariable.value : variable.default
      });
  };
}

function defaultValue(variable: ModuleVariable, bomModule?: BillOfMaterialModule): any {
  return arrayOf(bomModule?.variables)
    .filter(bomVariable => bomVariable.name === variable.name)
    .first()
    .map(v => v.value)
    .orElseGet(() => {
      if (isDefinedAndNotNull(variable)) {
        const result = variableValue(variable.type, variable.default)

        return result;
      } else {
        console.log('Variable is not defined or is null')
      }

      return '';
    });
}

const variableValue = (type: string, defaultValue: any): any => {
  if (type !== 'string' && typeof defaultValue === 'string') {
    try {
      return JSON.parse(defaultValue);
    } catch (err) {
      return defaultValue;
    }
  } else {
    return defaultValue;
  }

}

type ModuleProviderPredicate = (provider: ModuleProvider) => boolean

const notIncludesProvider = (providers: ModuleProvider[]): ModuleProviderPredicate => {
  const providerId = (provider: ModuleProvider) => {
    if (!provider.alias) {
      return provider.name;
    }

    return `${provider.name}-${provider.alias}`;
  }

  return (provider: ModuleProvider): boolean => {
    return !providers.map(p => providerId(p)).includes(providerId(provider));
  };
}


const mergeBomProvider = (bomProviders: BillOfMaterialProvider[]) => {
  return (provider: ModuleProvider) => {
    const result: ModuleProvider = arrayOf(bomProviders)
      .filter(p => p.name === provider.name && p.alias === provider.alias)
      .first()
      .map(bomP => Object.assign({}, provider, bomP))
      .orElse(provider as any);

    return result;
  }
}


const mergeBomProviderOld = (provider: ModuleProvider, bomProviders: BillOfMaterialProvider[]): ModuleProvider => {
  const result: ModuleProvider = arrayOf(bomProviders)
    .filter(p => p.name === provider.name && p.alias === provider.alias)
    .first()
    .map(bomP => Object.assign({}, provider, bomP))
    .orElse(provider as any);

  return result;
}

type BaseVariableMap = (variable: IBaseVariable) => IBaseVariable

const mergeBomVariablesIntoBaseVariable = (bomVariableArray: BillOfMaterialModuleVariable[]): BaseVariableMap => {
  const bomVariables = arrayOf(bomVariableArray)

  return (variable: IBaseVariable): IBaseVariable => {
    const optionalBomVariable: Optional<BillOfMaterialModuleVariable> = bomVariables
      .filter(v => v.name === variable.name && isUndefinedOrNull(variable.alias))
      .first();

    if (!optionalBomVariable.isPresent()) {
      return variable;
    }

    const bomVariable: BillOfMaterialModuleVariable = optionalBomVariable.get();

    return Object.assign(
      variable,
      bomVariable,
      {
        alias: isDefinedAndNotNull(variable.alias) ? variable.alias : bomVariable.alias,
        defaultValue: isDefined(bomVariable.value) ? bomVariable.value : variable.defaultValue
      });
  };
}

const buildGlobalVariableName = (variable: IPlaceholderVariable): string => {
  return variable.scope === 'global'
    ? componentName(variable)
    : `${variable.stageName}_${componentName(variable)}`
}

const createNewGlobalVariableAndAddToList = (globalVariables: IBaseVariable[], variable: IPlaceholderVariable) => {
  const name: string = buildGlobalVariableName(variable)

  return () => {
    const newVariable: IBaseVariable = Object.assign({type: 'string'}, variable, {name})

    globalVariables.push(newVariable)

    return newVariable
  }
}

const variablesInclude = (variables: IBaseVariable[], name: string): boolean => {
  return variables.map(v => v.name).includes(name)
}

const mapModuleVariable = (module: SingleModuleVersion | ModuleProvider) => {
  return (v: ModuleVariable) => {
    if (v.scope === 'ignore') {
      // nothing to do. skip this variable
      return undefined as any
    } else if (v.moduleRef) {
      const dep: ModuleDependency = findModuleDependency(v.moduleRef, isSingleModuleVersion(module) ? module.version : module, module)

      const depModule: Module | Module[] | undefined = dep._module
      if (!depModule) {
        if (!dep.optional) {
          throw new ModuleDependencyModuleNotFound(dep, module)
        }

        return new PlaceholderVariable({
          defaultValue: defaultValue(v, isSingleModuleVersion(module) ? module.bomModule : undefined),
          variable: v,
          stageName: componentName(module)
        })
      }

      return new ModuleRefVariable({
        name: v.name,
        moduleRef: Array.isArray(depModule) ? depModule.map(m => moduleRef(m)) : moduleRef(depModule),
        moduleOutputName: v.moduleRef.output,
        mapper: v.mapper
      })
    } else {
      return new PlaceholderVariable({
        defaultValue: defaultValue(v, isSingleModuleVersion(module) ? module.bomModule : undefined),
        variable: v,
        stageName: componentName(module)
      });
    }
  }
}
