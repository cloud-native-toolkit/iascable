import {Container, Inject} from 'typescript-ioc';
import {TerraformBuilderApi} from './terraform-builder.api';
import {
  BaseVariable,
  BillOfMaterialModel,
  BillOfMaterialModule,
  BillOfMaterialModuleVariable,
  BillOfMaterialProvider,
  BillOfMaterialVariable,
  buildTerraformProvider,
  GlobalRefVariable,
  IBaseVariable,
  isPlaceholderVariable,
  ModuleDependency,
  ModuleOutputRef,
  ModuleProvider,
  ModuleRef,
  ModuleRefVariable,
  ModuleVariable,
  ModuleVersion,
  PlaceholderVariable,
  SingleModuleVersion,
  Stage,
  StageImpl,
  TerraformComponent,
  TerraformProvider,
  TerraformProviderImpl
} from '../../models';
import {ModuleSelectorApi} from '../module-selector';
import {ModuleNotFound} from '../../errors';
import {ArrayUtil, of as arrayOf} from '../../util/array-util';
import {isDefinedAndNotNull, isUndefined, isUndefinedOrEmpty} from '../../util/object-util';
import {Optional, of} from '../../util/optional';
import {LoggerApi} from '../../util/logger';

function notIncludesProvider(providers: ModuleProvider[]) {
  const providerId = (provider: ModuleProvider) => {
    if (!provider.alias) {
      return provider.name;
    }

    return `${provider.name}-${provider.alias}`;
  }

  return (provider: ModuleProvider) => {
    return !providers.map(p => providerId(p)).includes(providerId(provider));
  };
}

function addProviderVariablesToBaseVariables(providers: TerraformProvider[], baseVariables: IBaseVariable[]) {
  providers
    .reduce((variables: string[], provider: TerraformProvider) => {
      provider.variables.forEach(variable => {
        if (!variables.includes(variable.ref)) {
          variables.push(variable.ref);
        }
      });

      return variables;
    }, [])
    .forEach(variableName => {
      if (!baseVariables.map(v => v.name).includes(variableName)) {
        baseVariables.push({name: variableName});
      }
    });
}

function mergeBomProvider(provider: ModuleProvider, bomProviders: BillOfMaterialProvider[]): ModuleProvider {
  const result: ModuleProvider = arrayOf(bomProviders)
    .filter(p => p.name === provider.name && p.alias === provider.alias)
    .first()
    .map(bomP => Object.assign({}, provider, bomP))
    .orElse(provider);

  return result;
}

function extractProviders(selectedModules: SingleModuleVersion[], bomProviders: BillOfMaterialProvider[] = []): TerraformProvider[] {
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

export class TerraformBuilder implements TerraformBuilderApi {
  constructor(@Inject private selector: ModuleSelectorApi) {
  }

  async buildTerraformComponent(selectedModules: SingleModuleVersion[], billOfMaterial?: BillOfMaterialModel): Promise<TerraformComponent> {

    const stages: { [name: string]: Stage } = selectedModules
      .reduce((stages: { [name: string]: Stage }, module: SingleModuleVersion) => {

        moduleToStage(stages, selectedModules, module);
        return stages;
      }, {});

    const baseVariables: IBaseVariable[] = [];

    await Promise.all(Object.keys(stages).map(async (stageSource) => {
      stages[stageSource] = await processStageVariables(stages[stageSource], baseVariables, billOfMaterial?.spec.variables);
    }));

    const providers: TerraformProvider[] = extractProviders(selectedModules, billOfMaterial?.spec.providers);

    addProviderVariablesToBaseVariables(providers, baseVariables);

    const name: string | undefined = billOfMaterial?.metadata.name;
    return new TerraformComponent({
      stages,
      baseVariables,
      providers,
      modules: selectedModules,
      bomVariables: billOfMaterial?.spec.variables,
      files: []
    }, name);
  }
}

function moduleToStage(stages: {[source: string]: Stage}, modules: SingleModuleVersion[], selectedModule: SingleModuleVersion): Stage {
  const stage: Stage = new StageImpl({
    name: selectedModule.alias || selectedModule.name,
    source: selectedModule.id,
    module: selectedModule,
    variables: [],
  });

  stages[stage.name] = stage;

  stage.variables = moduleVariablesToStageVariables(selectedModule, stages, modules);

  return stage;
}

function mergeBomVariables(bomVariables: ArrayUtil<BillOfMaterialModuleVariable>) {
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

function mergeBomVariablesIntoBaseVariable(bomVariables: ArrayUtil<BillOfMaterialModuleVariable>) {
  return (variable: BaseVariable): BaseVariable => {
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

function moduleVariablesToStageVariables(module: SingleModuleVersion, stages: {[source: string]: Stage}, modules: SingleModuleVersion[]): Array<BaseVariable> {
  const moduleVersion: ModuleVersion = module.version;
  const variables: ModuleVariable[] = moduleVersion.variables;

  const stageVariables: BaseVariable[] = variables
    .map(mergeBomVariables(arrayOf(module.bomModule?.variables)))
    .map(v => {
      if (v.scope === 'ignore') {
        // nothing to do. skip this variable

        return undefined as any;
      } else if (v.moduleRef) {
          const moduleRef: ModuleOutputRef = v.moduleRef;

          const optional: boolean = v.optional === true || isDefinedAndNotNull(v.default);
          const moduleOptional: boolean = module.version.dependencies?.filter(dep => dep.id === moduleRef.id)[0].optional || false

          const moduleRefSource: {stageName: string} | {stageName: string}[] | undefined = getSourceForModuleRef(moduleRef, moduleVersion, stages, modules, optional || moduleOptional, module);

          if (!isUndefined(moduleRefSource)) {
            const moduleRefVariable: ModuleRefVariable = new ModuleRefVariable({
              name: v.name,
              moduleRef: moduleRefSource,
              moduleOutputName: moduleRef.output,
              mapper: v.mapper,
              stageName: stageName(module)
            });

            return moduleRefVariable;
          } else {
            const placeholderVariable: PlaceholderVariable = new PlaceholderVariable({
              defaultValue: defaultValue(v, module.bomModule),
              variable: v,
              stageName: stageName(module)
            });

            return placeholderVariable;
          }
        } else {
          const placeholderVariable: PlaceholderVariable = new PlaceholderVariable({
            defaultValue: defaultValue(v, module.bomModule),
            variable: v,
            stageName: stageName(module)
          });

          return placeholderVariable;
        }
    })
    .filter(isDefinedAndNotNull);

  return stageVariables;
}

function getSourceForModuleRef(moduleRef: ModuleOutputRef, moduleVersion: ModuleVersion, stages: { [p: string]: Stage }, modules: SingleModuleVersion[], optional: boolean, module: SingleModuleVersion): {stageName: string} | {stageName: string}[] | undefined {

  const logger: LoggerApi = Container.get(LoggerApi).child('terraformBuilder.getSourceForModuleRef');

  logger.debug('Module version dependencies: ', moduleVersion.dependencies);

  const matchModuleId = (moduleRef: ModuleOutputRef) => {
    const moduleRefId = moduleRef.id;

    return (moduleDep: ModuleDependency): boolean => {
      const depIdWithoutExtension = moduleDep.id.replace(/.git$/, '');
      const depIdWithExtension = depIdWithoutExtension + '.git';

      return moduleRefId === depIdWithExtension || moduleRefId === depIdWithoutExtension;
    }
  }

  const moduleDep: ModuleDependency = arrayOf(moduleVersion.dependencies)
    .filter(matchModuleId(moduleRef))
    .first()
    .orElseThrow(new ModuleNotFound(moduleRef.id));

  logger.debug('Module dep: ', {moduleDep: moduleDep, moduleId: module.id});

  if (moduleDep.discriminator && moduleDep.discriminator !== '*') {
    const stageNamesFromDiscriminator: {stageName: string}[] = findStageOrModuleNames(stages, modules, moduleDep.discriminator)({source: ''})
      .map(stageName => ({stageName}));

    if (stageNamesFromDiscriminator.length > 0) {
      return stageNamesFromDiscriminator;
    }

    if (!optional) {
      throw new ModuleNotFound(moduleDep.id, module.id);
    }
  }

  const sources: string[] = arrayOf(moduleDep.refs)
    .map(m => m.source)
    .asArray();

  logger.debug('sources', sources);

  const stageNames: string[] = Object.keys(stages)
    .filter(stageName => {
      const stage: Stage = stages[stageName];

      const result = sources.includes(stage.source);

      return result;
    });

  if (stageNames.length > 0) {
    return stageNames.map(stageName => ({stageName}));
  }

  if (!optional) {
    throw new ModuleNotFound(moduleDep.id, module.id);
  }

  return;
}

function findStageOrModuleNames(stages: {[name: string]: Stage}, modules: SingleModuleVersion[], discriminator?: string): (ref: ModuleRef) => string[] {
  return (ref: ModuleRef): string[] => {
    if (discriminator && discriminator !== '*') {
      const stage = stages[discriminator];

      if (stage) {
        return [stage.name];
      }

      const moduleDiscriminators = arrayOf(modules).filter(m => discriminator === (m.alias || m.name)).map(m => discriminator).asArray();

      return moduleDiscriminators;
    }

    const matchStageSource = (ref: ModuleRef) => {
      const refSourceWithoutExtension = ref.source.replace(/.git$/, '');
      const refSourceWithExtension = refSourceWithoutExtension + '.git';

      return (stage: Stage): boolean => {
        return stage.source === refSourceWithoutExtension || stage.source === refSourceWithExtension;
      }
    }

    const stageNames: ArrayUtil<string> = arrayOf(Object.values(stages))
      .filter(matchStageSource(ref))
      .map(stage => stage.name);

    if (stageNames.length > 0) {
      return stageNames.asArray();
    }

    const matchSingleModuleVersion = (ref: ModuleRef) => {
      const refSourceWithoutExtension = ref.source.replace(/.git$/, '');
      const refSourceWithExtension = refSourceWithoutExtension + '.git';

      return (module: {id: string}): boolean => {
        return module.id === refSourceWithoutExtension || module.id === refSourceWithExtension;
      }
    }

    return arrayOf(modules)
      .filter(matchSingleModuleVersion(ref))
      .map(m => m.alias || m.name)
      .asArray();
  }
}

function getStageFromModuleRef(moduleSource: {name: string}, stages: { [p: string]: Stage }, modules: SingleModuleVersion[], billOfMaterial: BillOfMaterialModel): Stage {
  if (stages[moduleSource.name]) {
    return stages[moduleSource.name];
  } else {
    throw new Error('Stage with name not found: ' + moduleSource.name);
  }
}

async function processStageVariables(stage: Stage, globalVariables: IBaseVariable[], billOfMaterialVariables?: BillOfMaterialVariable[]): Promise<Stage> {
  const openVariables: BaseVariable[] = stage.variables.filter(v => isPlaceholderVariable(v));

  if (openVariables.length === 0) {
    return stage;
  }

  // @ts-ignore
  const stageVariables: IBaseVariable[] = stage.variables
    .map(mergeBomVariablesIntoBaseVariable(arrayOf(billOfMaterialVariables)))
    .map((variable: BaseVariable) => {
      if (!isPlaceholderVariable(variable)) {
        return variable;
      }

      if (variable.scope === 'ignore' && variable.defaultValue) {
        // nothing to do since the variable should be ignored and a default value has been provided
        return undefined;
      }

      const name = variable.scope === 'global'
        ? buildGlobalVariableName(variable)
        : buildModuleVariableName(variable, stage.name);

      const globalVariable: IBaseVariable = arrayOf(globalVariables)
        .filter(v => v.name === name)
        .first()
        .orElseGet(() => {
          const newVariable: IBaseVariable = Object.assign({type: 'string'}, variable, {name});

          globalVariables.push(newVariable);

          return newVariable;
        });

      return new GlobalRefVariable({
        name: variable.name,
        type: variable.type,
        variableName: globalVariable.name,
        description: variable.description,
      });
    })
    .filter(v => !isUndefined(v));

  return Object.assign({}, stage, {variables: stageVariables});
}

const stageName = (module: {alias?: string, name: string}): string => {
  return module.alias || module.name
}

function buildGlobalVariableName(variable: IBaseVariable) {
  return variable.alias || variable.name;
}

function buildModuleVariableName(variable: IBaseVariable, stageName: string) {
  return stageName + '_' + buildGlobalVariableName(variable);
}


function getBomVariable(variable: ModuleVariable, bom?: BillOfMaterialModule): BillOfMaterialModuleVariable | undefined {
  if (!bom) {
    return;
  }

  const optionalBomVariable: Optional<BillOfMaterialModuleVariable> = arrayOf(bom?.variables)
    .filter(bomVariable => bomVariable.name === variable.name)
    .first();

  return optionalBomVariable.orElse(undefined as any);
}

function defaultValue(variable: ModuleVariable, bomModule?: BillOfMaterialModule): any {
  const bomVariable = arrayOf(bomModule?.variables)
    .filter(bomVariable => bomVariable.name === variable.name)
    .first()
    .map(v => v.value);

  return bomVariable.orElseGet(() => {
    if (variable.default !== null && variable.default !== undefined) {
      return variable.default;
    }

    return variable.defaultValue;
  });
}
