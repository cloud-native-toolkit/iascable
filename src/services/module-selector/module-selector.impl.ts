import {default as jsYaml} from 'js-yaml';
import {Container} from 'typescript-ioc';

import {ModuleSelectorApi} from './module-selector.api';
import {SelectedModules} from './selected-modules.model';
import {
  BillOfMaterial,
  BillOfMaterialModel,
  BillOfMaterialModule,
  Catalog,
  CatalogCategoryModel,
  CatalogModel,
  Module,
  SingleModuleVersion,
  wrapModule,
  WrappedModule
} from '../../models';
import {QuestionBuilder} from '../../util/question-builder';
import {QuestionBuilderImpl} from '../../util/question-builder/question-builder.impl';
import {LoggerApi} from '../../util/logger';
import {BillOfMaterialModuleConfigError, ModuleNotFound} from '../../errors';
import {of as arrayOf} from '../../util/array-util';
import {isDefinedAndNotNull, isUndefined} from '../../util/object-util';

export class ModuleSelector implements ModuleSelectorApi {
  logger: LoggerApi;

  constructor() {
    this.logger = Container.get(LoggerApi).child('ModuleSelector');
  }

  async buildBillOfMaterial(catalogModel: CatalogModel, input?: BillOfMaterialModel, filter?: { platform?: string; provider?: string }): Promise<BillOfMaterialModel> {
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

    const bomModules: BillOfMaterialModule[] = BillOfMaterial.getModules(input);

    const modules: Module[] = sortModules(fullCatalog, bomModules)
      .map(bomModule => {
        const module: Module | undefined = fullCatalog.lookupModule(bomModule);

        // TODO what should happen if the BOM specifies a module that cannot be found?
        if (!module) {
          return undefined as any;
        }

        return Object.assign({}, module, {alias: bomModule.alias || module.alias, bomModule: Object.assign({}, bomModule)}) as Module;
      })
      .filter(m => !!m);

    this.logger.debug('Modules', modules);

    return new SelectedModules(fullCatalog).resolveModules(modules);
  }

  async validateBillOfMaterialModuleConfigYaml(catalogModel: CatalogModel, moduleRef: string, yaml: string): Promise<string> {
    const moduleConfig: BillOfMaterialModule = jsYaml.load(yaml) as any;

    return this.validateBillOfMaterialModuleConfig(catalogModel, moduleConfig);
  }

  async validateBillOfMaterial(catalogModel: CatalogModel, bom: BillOfMaterialModel): Promise<Array<string | Error>> {
    const result = Promise
      .all(BillOfMaterial.getModules(bom).map(m => {
        return this.validateBillOfMaterialModuleConfig(catalogModel, m);
      }))
      .then((result: Array<string | Error>) => result.filter(isDefinedAndNotNull));

    return result;
  }

  async validateBillOfMaterialModuleConfig(catalogModel: CatalogModel, moduleConfig: BillOfMaterialModule): Promise<string> {
    const fullCatalog: Catalog = Catalog.fromModel(catalogModel);

    const moduleRef: string | undefined = moduleConfig.name || moduleConfig.id;
    if (isUndefined(moduleRef)) {
      throw new ModuleNotFound('unknown');
    }

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

    const unmatchedVariableNames: string[] = arrayOf(moduleConfig.variables)
      .filter(v => !availableVariableNames.includes(v.name))
      .map(v => v.name)
      .asArray();
    const unmatchedDependencyNames: string[] = arrayOf(moduleConfig.dependencies)
      .filter(d => !availableDependencyNames.includes(d.name))
      .map(d => d.name)
      .asArray();

    if (unmatchedVariableNames.length > 0 || unmatchedDependencyNames.length > 0) {
      throw new BillOfMaterialModuleConfigError({unmatchedVariableNames, unmatchedDependencyNames, availableVariableNames, availableDependencyNames});
    }

    return moduleRef;
  }
}

function billOfMaterialIncludesModule(modules: BillOfMaterialModule[], module: Module): boolean {
  return modules.filter(m => m.id === module.id || m.name === module.name).length > 0;
}

export function sortModules(catalog: Catalog, bomModules: BillOfMaterialModule[]): BillOfMaterialModule[] {
  return bomModules.slice().sort((a: BillOfMaterialModule, b: BillOfMaterialModule) => {
    const moduleA: WrappedModule = wrapModule(catalog.lookupModule(a));
    const moduleB: WrappedModule = wrapModule(catalog.lookupModule(b));

    if (moduleB.dependsOn(moduleA)) {
      return -1;
    } else if (moduleA.dependsOn(moduleB)) {
      return 1;
    } else {
      return moduleA.name.localeCompare(moduleB.name);
    }
  });
}
