import {Container, Inject} from 'typescript-ioc';
import {TerraformBuilderApi} from './terraform-builder.api';
import {
  BaseVariable,
  BillOfMaterialModel,
  BillOfMaterialModule,
  BillOfMaterialModuleVariable, BillOfMaterialVariable,
  GlobalRefVariable,
  IBaseVariable,
  isPlaceholderVariable,
  ModuleDependency,
  ModuleOutputRef,
  ModuleRef,
  ModuleRefVariable,
  ModuleVariable,
  ModuleVersion,
  PlaceholderVariable,
  SingleModuleVersion,
  Stage,
  StageImpl,
  TerraformComponent
} from '../../models';
import {ModuleSelectorApi} from '../module-selector';
import {ModuleNotFound} from '../../errors';
import {ArrayUtil, of as arrayOf} from '../../util/array-util';
import {isDefinedAndNotNull, isUndefined, isUndefinedOrEmpty} from '../../util/object-util';
import {Optional, of} from '../../util/optional';
import {LoggerApi} from '../../util/logger';

export class TerraformBuilder implements TerraformBuilderApi {
  constructor(@Inject private selector: ModuleSelectorApi) {
  }

  async buildTerraformComponent(selectedModules: SingleModuleVersion[], billOfMaterial?: BillOfMaterialModel): Promise<TerraformComponent> {

    const stages: { [name: string]: Stage } = selectedModules.reduce((stages: { [name: string]: Stage }, module: SingleModuleVersion) => {
      moduleToStage(stages, selectedModules, module);
      return stages;
    }, {});

    const baseVariables: IBaseVariable[] = [];

    await Promise.all(Object.keys(stages).map(async (stageSource) => {
      stages[stageSource] = await processStageVariables(stages[stageSource], baseVariables, billOfMaterial?.spec.variables);
    }))

    const name: string | undefined = billOfMaterial?.metadata.name;
    return new TerraformComponent({stages, baseVariables, modules: selectedModules, bomVariables: billOfMaterial?.spec.variables, files: []}, name);
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

          const moduleRefSource: {stageName: string} | {stageName: string}[] | undefined = getSourceForModuleRef(moduleRef, moduleVersion, stages, modules, optional, module);

          if (!isUndefined(moduleRefSource)) {
            const moduleRefVariable: ModuleRefVariable = new ModuleRefVariable({
              name: v.name,
              moduleRef: moduleRefSource,
              moduleOutputName: moduleRef.output,
              mapper: v.mapper,
            });

            return moduleRefVariable;
          } else {
            const placeholderVariable: PlaceholderVariable = new PlaceholderVariable({
              name: v.name,
              description: v.description,
              type: v.type || 'string',
              scope: v.scope || 'module',
              defaultValue: defaultValue(v, module.bomModule),
              alias: v.alias,
              variable: v,
            });

            return placeholderVariable;
          }
        } else {
          const placeholderVariable: PlaceholderVariable = new PlaceholderVariable({
            name: v.name,
            description: v.description,
            type: v.type || 'string',
            scope: v.scope || 'module',
            defaultValue: defaultValue(v, module.bomModule),
            alias: v.alias,
            variable: v,
          });

          return placeholderVariable;
        }
    })
    .filter(isDefinedAndNotNull);

  return stageVariables;
}

function getSourceForModuleRef(moduleRef: ModuleOutputRef, moduleVersion: ModuleVersion, stages: { [p: string]: Stage }, modules: SingleModuleVersion[], optional: boolean, module: SingleModuleVersion): {stageName: string} | {stageName: string}[] | undefined {

  const logger: LoggerApi = Container.get(LoggerApi).child('terrformBuilder.getSourceForModuleRef');

  const moduleDep: ModuleDependency = arrayOf(moduleVersion.dependencies)
    .filter(moduleDep => moduleDep.id === moduleRef.id)
    .first()
    .orElseThrow(new ModuleNotFound(moduleRef.id));

  logger.debug('Discriminator: ', moduleDep.discriminator, module.id);

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

      return arrayOf(modules).filter(m => discriminator === (m.alias || m.name)).map(m => discriminator).asArray();
    }

    const stageNames: ArrayUtil<string> = arrayOf(Object.values(stages))
      .filter(stage => stage.source === ref.source)
      .map(stage => stage.name);

    if (stageNames.length > 0) {
      return stageNames.asArray();
    }

    return arrayOf(modules)
      .filter(m => m.id === ref.source)
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
        description: variable.description
      });
    })
    .filter(v => !isUndefined(v));

  return Object.assign({}, stage, {variables: stageVariables});
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
