import {default as jsYaml} from 'js-yaml';
import {Container} from 'typescript-ioc';
import deepClone from 'lodash.clonedeep';

import {ModuleSelectorApi} from './module-selector.api';
import {
  BillOfMaterial,
  BillOfMaterialModel,
  BillOfMaterialModule,
  Catalog,
  CatalogCategoryModel, CatalogFilter,
  CatalogModel,
  Module, ModuleVersion,
  SingleModuleVersion,
  injectDependsOnFunction,
  ModuleWithDependsOn
} from '../../models';
import {QuestionBuilder} from '../../util/question-builder';
import {QuestionBuilderImpl} from '../../util/question-builder/question-builder.impl';
import {LoggerApi} from '../../util/logger';
import {BillOfMaterialModuleConfigError, ModuleMetadataInvalid, ModuleNotFound} from '../../errors';
import {of as arrayOf} from '../../util/array-util/array-util';
import {resolveSelectedModules} from './selected-modules.resolver';

export class ModuleSelector implements ModuleSelectorApi {
  logger: LoggerApi;

  constructor() {
    this.logger = Container.get(LoggerApi).child('ModuleSelector');
  }

  async buildBillOfMaterial(catalogModel: CatalogModel, input?: BillOfMaterialModel, filter?: CatalogFilter): Promise<BillOfMaterialModel> {
    const fullCatalog: Catalog = Catalog.fromModel(catalogModel);

    const catalog: Catalog = fullCatalog.filter(filter);

    const modules: Module[] = await this.makeModuleSelections(catalog, input);

    return new BillOfMaterial(input).addModules(...modules);
  }

  async makeModuleSelections(catalog: Catalog, input?: BillOfMaterialModel): Promise<Module[]> {
    type QuestionResult = { [category: string]: Module | Module[] };

    const moduleIds: BillOfMaterialModule[] = BillOfMaterial.getModuleRefs(input);

    function isModuleArray(value: Module | Module[]): value is Module[] {
      return !!value && Array.isArray(value as any);
    }

    const questionBuilder: QuestionBuilder<QuestionResult> = catalog.categories
      .reduce((questionBuilder: QuestionBuilder<QuestionResult>, category: CatalogCategoryModel) => {
        if (category.modules.length === 0) {
          return questionBuilder;
        }

        if (category.selection === 'required') {
          const choices = category.modules.map(m => ({name: `${m.name}: ${m.description} `, value: m}));

          questionBuilder.question({
            name: category.category,
            type: 'list',
            message: `Which ${category.category} module should be used?`,
            choices,
          }, undefined, true);
        } else if (category.selection === 'single') {
          const choices = category.modules.map(m => ({
            name: `${m.name}: ${m.description} `,
            value: m,
            checked: billOfMaterialIncludesModule(moduleIds, m),
          }));
          choices.push({
            name: 'None',
            value: null as any,
            checked: false
          });

          questionBuilder.question({
            name: category.category,
            type: 'list',
            message: `Which ${category.category} module should be used?`,
            choices,
          }, undefined, true);
        } else if (category.selection === 'multiple') {
          const choices = category.modules.map(m => ({
            name: `${m.name}: ${m.description} `,
            value: m,
            checked: billOfMaterialIncludesModule(moduleIds, m),
          }));

          questionBuilder.question({
            name: category.category,
            type: 'checkbox-plus',
            message: `Which ${category.category} module(s) should be used?`,
            choices,
            source: async (answers: QuestionResult, input: any): Promise<any[]> => choices,
          }, undefined, true);
        }

        return questionBuilder;
      }, new QuestionBuilderImpl<QuestionResult>());

    return Object.values(await questionBuilder.prompt())
      .map((value: Module | Module[]) => isModuleArray(value) ? value : [value])
      .reduce((result: Module[], current: Module[]) => {
        if (current) {
          result.push(...(current as Module[]).filter(m => !!m));
        }

        return result;
      }, [])
  }

  async resolveBillOfMaterial(catalogModel: CatalogModel, input: BillOfMaterialModel): Promise<SingleModuleVersion[]> {
    const fullCatalog: Catalog = Catalog.fromModel(catalogModel);

    const bomModules: BillOfMaterialModule[] = BillOfMaterial.getModules(input)

    const modules: Module[] = this.lookupModules(fullCatalog, bomModules)

    this.logger.debug('Modules', modules)

    return resolveSelectedModules(fullCatalog, modules)
  }

  lookupModules(fullCatalog: Catalog, bomModules: BillOfMaterialModule[]): Module[] {
    const sortedModules: BillOfMaterialModule[] = sortModules(fullCatalog, bomModules)

    const modules: Module[] = sortedModules.map(bomModule => {
      const moduleLookup: Module | undefined = fullCatalog.lookupModule(bomModule);

      const module: Module = validateAndCloneModule(moduleLookup, bomModule);

      const filteredVersions: ModuleVersion[] = filterVersionsAgainstBomVersions(module.versions, bomModule);

      return Object.assign(
        module,
        {
          originalAlias: module.alias,
          alias: bomModule.alias || module.alias,
          versions: filteredVersions,
          bomModule: Object.assign({}, bomModule)
        },
        bomModule.default ? {default: true} : {}
      ) as Module;
    });

    return modules;
  }

  async validateBillOfMaterialModuleConfigYaml(catalogModel: CatalogModel, moduleRef: string, yaml: string) {
    const fullCatalog: Catalog = Catalog.fromModel(catalogModel);

    const module: Module | undefined = fullCatalog.lookupModule({id: moduleRef, name: moduleRef});
    if (!module) {
      throw new ModuleNotFound(moduleRef);
    }

    const availableVariableNames: string[] = arrayOf(module.versions[0].variables)
      .map(v => v.name)
      .asArray();
    const availableDependencyNames: string[] = arrayOf(module.versions[0].dependencies)
      .map(v => v.id)
      .asArray();

    const moduleConfig: BillOfMaterialModule = jsYaml.load(yaml) as any;
    const unmatchedVariableNames: string[] = arrayOf(moduleConfig.variables)
      .filter(v => !availableVariableNames.includes(v.name))
      .map(v => v.name)
      .asArray();
    const unmatchedDependencyNames: string[] = arrayOf(moduleConfig.dependencies)
      .filter(d => !availableDependencyNames.includes(d.name || d.id || ''))
      .map(d => d.name || d.id || '')
      .asArray();

    if (unmatchedVariableNames.length > 0 || unmatchedDependencyNames.length > 0) {
      throw new BillOfMaterialModuleConfigError({unmatchedVariableNames, unmatchedDependencyNames, availableVariableNames, availableDependencyNames});
    }
  }
}

function billOfMaterialIncludesModule(modules: BillOfMaterialModule[], module: Module): boolean {
  return modules.filter(m => m.id === module.id || m.name === module.name).length > 0;
}

export const sortModules = (catalog: Catalog, bomModules: BillOfMaterialModule[]): BillOfMaterialModule[] => {
  return bomModules
    .slice()
    .sort((a: BillOfMaterialModule, b: BillOfMaterialModule) => {
      const moduleA: ModuleWithDependsOn = injectDependsOnFunction(catalog.lookupModule(a));
      const moduleB: ModuleWithDependsOn = injectDependsOnFunction(catalog.lookupModule(b));

      if (moduleB.dependsOn(moduleA)) {
        return -1;
      } else if (moduleA.dependsOn(moduleB)) {
        return 1;
      } else {
        return moduleA.name.localeCompare(moduleB.name);
      }
    });
}

export const validateAndCloneModule = (module: Module | undefined, bomModule: BillOfMaterialModule): Module => {
  if (!module) {
    throw new ModuleNotFound(bomModule.name || bomModule.id || 'unknown', module)
  }

  if (!module.versions || !Array.isArray(module.versions)) {
    throw new ModuleMetadataInvalid('Module versions is not an array: ' + module.name, module);
  }

  return deepClone(module);
}

export const filterVersionsAgainstBomVersions = (moduleVersions: ModuleVersion[] | undefined, bomModule: BillOfMaterialModule): ModuleVersion[] => {
  if (!moduleVersions) {
    return [];
  }

  if (!bomModule.version) {
    return moduleVersions;
  }

  return arrayOf(moduleVersions)
    .filter(m => m.version === bomModule.version)
    .ifEmpty(() => moduleVersions)
    .asArray();
}
