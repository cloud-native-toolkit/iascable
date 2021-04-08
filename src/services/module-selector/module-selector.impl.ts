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
  SingleModuleVersion
} from '../../models';
import {QuestionBuilder} from '../../util/question-builder';
import {QuestionBuilderImpl} from '../../util/question-builder/question-builder.impl';
import {LoggerApi} from '../../util/logger';
import {Container} from 'typescript-ioc';

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

    const modules: Module[] = bomModules
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
}

function billOfMaterialIncludesModule(modules: BillOfMaterialModule[], module: Module): boolean {
  return modules.filter(m => m.id === module.id || m.name === module.name).length > 0;
}
