import {TerraformBuilderApi} from './terraform-builder.api';
import {
  BaseVariable,
  BillOfMaterialModel,
  BillOfMaterialModule,
  BillOfMaterialModuleVariable,
  BillOfMaterialProvider,
  BillOfMaterialVariable,
  buildTerraformProvider,
  IBaseVariable,
  IPlaceholderVariable,
  isPlaceholderVariable,
  Module,
  ModuleDependency,
  ModuleOutputRef,
  ModuleProvider,
  ModuleRefVariable,
  ModuleVariable,
  PlaceholderVariable,
  ProviderVariable,
  SingleModuleVersion,
  Stage,
  StageImpl,
  TerraformComponent,
  TerraformProvider
} from '../../models';
import {ModuleDependencyModuleNotFound, ModuleDependencyNotFound} from '../../errors';
import {ArrayUtil, of as arrayOf} from '../../util/array-util'
import {isDefinedAndNotNull} from '../../util/object-util';
import {Optional} from '../../util/optional';

interface TerraformResult {
  stages: {[name: string]: Stage}
  baseVariables: IBaseVariable[]
}

export class TerraformBuilderNew implements TerraformBuilderApi {
  async buildTerraformComponent(modules: SingleModuleVersion[], billOfMaterial?: BillOfMaterialModel): Promise<TerraformComponent> {

    const terraform: TerraformResult = modules.reduce(
      (result: TerraformResult, module: SingleModuleVersion) => {
        const variables = this.moduleVariablesToStageVariables(module)

        const stage: Stage = new StageImpl({
          name: componentName(module),
          source: module.id,
          module,
          variables,
        });

        result.stages[stage.name] = stage
        result.baseVariables.push(...variables)

        return result
      },
      {stages: {}, baseVariables: []}
    )

    const providers: TerraformProvider[] = extractProviders(modules, billOfMaterial?.spec.providers);

    const baseVariables: IBaseVariable[] = this.processBaseVariables(terraform.baseVariables, providers, billOfMaterial?.spec.variables)

    const name: string | undefined = billOfMaterial?.metadata.name;
    return new TerraformComponent({
      stages: terraform.stages,
      baseVariables,
      providers,
      modules,
      bomVariables: billOfMaterial?.spec.variables,
      files: []
    }, name);
  }

  moduleVariablesToStageVariables(module: SingleModuleVersion): BaseVariable[] {

    const stageVariables: BaseVariable[] = module.version.variables
      .map(mergeBomVariables(arrayOf(module.bomModule?.variables)))
      .map(v => {
        if (v.scope === 'ignore') {
          // nothing to do. skip this variable
          return undefined as any
        } else if (v.moduleRef) {
          const dep: ModuleDependency = findModuleDependency(v.moduleRef, module)

          const depModule: Module | Module[] | undefined = dep._module
          if (!depModule) {
            if (!dep.optional) {
              throw new ModuleDependencyModuleNotFound(dep, module)
            }

            return new PlaceholderVariable({
              defaultValue: defaultValue(v, module.bomModule),
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
            defaultValue: defaultValue(v, module.bomModule),
            variable: v,
            stageName: componentName(module)
          });
        }
      })
      .filter(isDefinedAndNotNull)

    return stageVariables
  }

  processBaseVariables(variables: IBaseVariable[], providers: TerraformProvider[], billOfMaterialVariables: BillOfMaterialVariable[] = []): IBaseVariable[] {

    const globalVariables: IBaseVariable[] = variables
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

    return arrayOf(providers)
      .map(p => p.variables)
      .mergeMap<ProviderVariable>()
      .reduce((variables: IBaseVariable[], providerVariable: ProviderVariable) => {

        if (providerVariable.ref && !variablesInclude(variables, providerVariable.ref)) {
          variables.push({name: providerVariable.ref})
        }

        return variables
      }, globalVariables)
  }
}

const componentName = (module: {alias?: string, name: string}): string => {
  return module.alias || module.name
}

const moduleRef = (module: {alias?: string, name: string}): {stageName: string} => {
  return {stageName: componentName(module)}
}

const findModuleDependency = (ref: ModuleOutputRef, parentModule: SingleModuleVersion): ModuleDependency => {
  const result: Optional<ModuleDependency> = arrayOf(parentModule.version.dependencies)
    .filter(dep => dep.id === ref.id)
    .first()

  return result.orElseThrow(new ModuleDependencyNotFound(ref, parentModule))
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
        default: isDefinedAndNotNull(bomVariable.value) ? bomVariable.value : variable.default
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
        return variable.default;
      }

      return variable.defaultValue;
    });
}

const extractProviders = (selectedModules: SingleModuleVersion[], bomProviders: BillOfMaterialProvider[] = []): TerraformProvider[] => {
  const moduleProviders: ModuleProvider[] = arrayOf(selectedModules)
    .map(m => m.version)
    .map(v => v.providers)
    .mergeMap<ModuleProvider>()
    .filter(p => !!p)
    .reduce((result: ModuleProvider[], currentProvider: ModuleProvider) => {

      if (notIncludesProvider(result)(currentProvider)) {
        result.push(mergeBomProvider(currentProvider, bomProviders));
      }

      return result;
    }, []);

  return moduleProviders.map(buildTerraformProvider);
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

const mergeBomProvider = (provider: ModuleProvider, bomProviders: BillOfMaterialProvider[]): ModuleProvider => {
  const result: ModuleProvider = arrayOf(bomProviders)
    .filter(p => p.name === provider.name && p.alias === provider.alias)
    .first()
    .map(bomP => Object.assign({}, provider, bomP))
    .orElse(provider);

  return result;
}

type BaseVariableMap = (variable: IBaseVariable) => IBaseVariable

const mergeBomVariablesIntoBaseVariable = (bomVariableArray: BillOfMaterialModuleVariable[]): BaseVariableMap => {
  const bomVariables = arrayOf(bomVariableArray)

  return (variable: IBaseVariable): IBaseVariable => {
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
        alias: isDefinedAndNotNull(variable.alias) ? variable.alias : bomVariable.alias,
        defaultValue: isDefinedAndNotNull(bomVariable.value) ? bomVariable.value : variable.defaultValue
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
