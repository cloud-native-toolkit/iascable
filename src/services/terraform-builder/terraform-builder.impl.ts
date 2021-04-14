import {Inject} from 'typescript-ioc';
import {TerraformBuilderApi} from './terraform-builder.api';
import {
  BaseVariable,
  BillOfMaterialModel,
  BillOfMaterialModule,
  BillOfMaterialModuleVariable,
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
import {of as arrayOf} from '../../util/array-util';
import {isDefinedAndNotNull, isUndefined, isUndefinedOrNull} from '../../util/object-util';
import {Optional} from '../../util/optional';

export class TerraformBuilder implements TerraformBuilderApi {
  constructor(@Inject private selector: ModuleSelectorApi) {
  }

  async buildTerraformComponent(selectedModules: SingleModuleVersion[]): Promise<TerraformComponent> {

    const stages: { [name: string]: Stage } = selectedModules.reduce((stages: { [name: string]: Stage }, module: SingleModuleVersion) => {
      moduleToStage(stages, selectedModules, module);
      return stages;
    }, {});

    const baseVariables: IBaseVariable[] = [];

    await Promise.all(Object.keys(stages).map(async (stageSource) => {
      stages[stageSource] = await processStageVariables(stages[stageSource], baseVariables);
    }))

    return new TerraformComponent({stages, baseVariables, modules: selectedModules, files: []});
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

function moduleVariablesToStageVariables(module: SingleModuleVersion, stages: {[source: string]: Stage}, modules: SingleModuleVersion[]): Array<BaseVariable> {
  const moduleVersion: ModuleVersion = module.version;
  const variables: ModuleVariable[] = moduleVersion.variables;

  const stageVariables: BaseVariable[] = variables
    .map(v => {
      if (v.scope === 'ignore') {
        // nothing to do. skip this variable

        return undefined as any;
      } else if (v.moduleRef) {
          const moduleRef: ModuleOutputRef = v.moduleRef;

          const optional: boolean = v.optional === true || isDefinedAndNotNull(v.default)

          const moduleRefSource: {stageName: string} | undefined = getSourceForModuleRef(moduleRef, moduleVersion, stages, modules, optional, module);

          if (!isUndefined(moduleRefSource)) {
            const moduleRefVariable: ModuleRefVariable = new ModuleRefVariable({
              name: v.name,
              moduleRef: moduleRefSource,
              moduleOutputName: moduleRef.output
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

function getSourceForModuleRef(moduleRef: ModuleOutputRef, moduleVersion: ModuleVersion, stages: { [p: string]: Stage }, modules: SingleModuleVersion[], optional: boolean, module: SingleModuleVersion): {stageName: string} | undefined {

  const moduleDeps: ModuleDependency = arrayOf(moduleVersion.dependencies)
    .filter(moduleDep => moduleDep.id === moduleRef.id)
    .first()
    .orElseThrow(new ModuleNotFound(moduleRef.id));

  const source: Optional<{stageName: string}> = arrayOf(moduleDeps.refs)
    .map(findStageOrModuleName(stages, modules, moduleDeps.discriminator))
    .filter(isDefinedAndNotNull)
    .first()
    .map(stageName => ({stageName}));

  if (source.isPresent()) {
    return source.get();
  }

  if (!optional) {
    source.orElseThrow(new ModuleNotFound(moduleDeps.id, module.id));
  }

  return;
}

function findStageOrModuleName(stages: {[name: string]: Stage}, modules: SingleModuleVersion[], discriminator?: string): (ref: ModuleRef) => string {
  return (ref: ModuleRef): string => {
    if (discriminator) {
      const stage = stages[discriminator];

      if (stage) {
        return stage.name;
      }

      return arrayOf(modules).filter(m => discriminator === (m.alias || m.name)).first().map(m => discriminator).get();
    }

    return arrayOf(Object.values(stages))
      .filter(stage => stage.source === ref.source)
      .first()
      .map(s => s.name)
      .orElseGet(() => {
        const moduleName = arrayOf(modules)
          .filter(m => m.id === ref.source)
          .first()
          .map(m => m.alias || m.name)
          .orElse(undefined as any);

        return moduleName;
      });
  }
}

function getStageFromModuleRef(moduleSource: {name: string}, stages: { [p: string]: Stage }, modules: SingleModuleVersion[], billOfMaterial: BillOfMaterialModel): Stage {
  if (stages[moduleSource.name]) {
    return stages[moduleSource.name];
  } else {
    throw new Error('Stage with name not found: ' + moduleSource.name);
  }
}

async function processStageVariables(stage: Stage, globalVariables: IBaseVariable[]): Promise<Stage> {
  const openVariables: BaseVariable[] = stage.variables.filter(v => isPlaceholderVariable(v));

  if (openVariables.length === 0) {
    return stage;
  }

  // @ts-ignore
  const stageVariables: IBaseVariable[] = stage.variables
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
