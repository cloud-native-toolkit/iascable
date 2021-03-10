import {Inject} from 'typescript-ioc';
import {TerraformBuilderApi} from './terraform-builder.api';
import {
  BaseVariable,
  GlobalRefVariable,
  IBaseVariable,
  isPlaceholderVariable,
  ModuleDependency,
  ModuleOutputRef,
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
import {isUndefined} from '../../util/object-util';

export class TerraformBuilder implements TerraformBuilderApi {
  constructor(@Inject private selector: ModuleSelectorApi) {
  }

  async buildTerraformComponent(selectedModules: SingleModuleVersion[]): Promise<TerraformComponent> {
    const stages: { [source: string]: Stage } = selectedModules.reduce((stages: { [source: string]: Stage }, module: SingleModuleVersion) => {
      moduleToStage(stages, selectedModules, module);
      return stages;
    }, {});

    const baseVariables: IBaseVariable[] = [];

    const stageSources: string[] = Object.keys(stages);
    for (let i = 0; i < stageSources.length; i++) {
      stages[stageSources[i]] = await processStageVariables(stages[stageSources[i]], baseVariables);
    }

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

  stages[stage.source] = stage;

  stage.variables = moduleVariablesToStageVariables(selectedModule, stages, modules);

  return stage;
}

function moduleVariablesToStageVariables(module: SingleModuleVersion, stages: {[source: string]: Stage}, modules: SingleModuleVersion[]): Array<BaseVariable> {
  const moduleVersion: ModuleVersion = module.version;
  const variables: ModuleVariable[] = moduleVersion.variables;

  const stageVariables: BaseVariable[] = variables.map(v => {
    if (v.moduleRef) {
      const moduleRef: ModuleOutputRef = v.moduleRef;

      const moduleRefSource: string = getSourceForModuleRef(moduleRef, moduleVersion, stages, modules);
      const refStage: Stage = getStageFromModuleRef(moduleRefSource, stages, modules);

      const moduleRefVariable: ModuleRefVariable = new ModuleRefVariable({
        name: v.name,
        moduleRef: refStage,
        moduleOutputName: moduleRef.output
      });

      return moduleRefVariable;
    } else {
      const placeholderVariable: PlaceholderVariable = new PlaceholderVariable({
        name: v.name,
        description: v.description,
        type: v.type || 'string',
        scope: v.scope || 'module',
        defaultValue: defaultValue(v),
        alias: v.alias,
        variable: v,
      });

      return placeholderVariable;
    }
  });

  return stageVariables;
}

function getSourceForModuleRef(moduleRef: ModuleOutputRef, moduleVersion: ModuleVersion, stages: { [p: string]: Stage }, modules: SingleModuleVersion[]): string {
  const moduleDeps: ModuleDependency = arrayOf(moduleVersion.dependencies)
    .filter(d => d.id === moduleRef.id)
    .first()
    .orElseThrow(new ModuleNotFound(moduleRef.id));

  if (moduleDeps.refs.length === 1) {
    return moduleDeps.refs[0].source;
  }

  return arrayOf(moduleDeps.refs)
    .map((r => stages[r.source]))
    .filter((s: Stage) => !!s)
    .map(s => s.source)
    .first()
    .orElseThrow(new ModuleNotFound(moduleDeps.id));
}

function getStageFromModuleRef(moduleSource: string, stages: { [p: string]: Stage }, modules: SingleModuleVersion[]): Stage {
  if (stages[moduleSource]) {
    return stages[moduleSource];
  }

  const filteredModules: SingleModuleVersion[] = modules.filter(m => m.id === moduleSource);
  if (filteredModules.length === 0) {
    throw new ModuleNotFound(moduleSource);
  }

  return moduleToStage(stages, modules, filteredModules[0]);
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

function defaultValue(variable: ModuleVariable) {
  if (variable.default !== null && variable.default !== undefined) {
    return variable.default;
  }

  return variable.defaultValue;
}
