import {ModuleSelectorApi} from './module-selector.api';
import {Catalog, CatalogCategoryModel, CatalogModel} from '../../models/catalog.model';
import {
  BillOfMaterial,
  BillOfMaterialModel,
  BillOfMaterialModule
} from '../../models/bill-of-material.model';
import {SelectedModules} from './selected-modules.model';
import {Module, SingleModuleVersion} from '../../models/module.model';
import {QuestionBuilder} from '../../util/question-builder';
import {QuestionBuilderImpl} from '../../util/question-builder/question-builder.impl';

export class ModuleSelector implements ModuleSelectorApi {
  async buildBillOfMaterial(catalogModel: CatalogModel, input?: BillOfMaterialModel, filter?: { platform?: string; provider?: string }): Promise<BillOfMaterialModel> {
    const fullCatalog: Catalog = Catalog.fromModel(catalogModel);

    const catalog: Catalog = fullCatalog.filter(filter);

    const modules: Module[] = await this.makeModuleSelections(catalog, input);

    return new BillOfMaterial(input).addModules(...modules);
  }

  async makeModuleSelections(catalog: Catalog, input?: BillOfMaterialModel): Promise<Module[]> {
    type QuestionResult = { [category: string]: Module | Module[] };

    const moduleIds: string[] = BillOfMaterial.getModuleIds(input);

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
          }, '', true);
        } else if (category.selection === 'single') {
          const choices = category.modules.map(m => ({
            name: `${m.name}: ${m.description} `,
            value: m,
            checked: moduleIds.includes(m.id)
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
          }, '', true);
        } else if (category.selection === 'multiple') {
          const choices = category.modules.map(m => ({
            name: `${m.name}: ${m.description} `,
            value: m,
            checked: moduleIds.includes(m.id)
          }));

          questionBuilder.question({
            name: category.category,
            type: 'checkbox-plus',
            message: `Which ${category.category} module(s) should be used?`,
            choices,
            source: async (answers: QuestionResult, input: any): Promise<any[]> => choices,
          }, '', true);
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

    const modules: Module[] = fullCatalog.filter({modules: bomModules}).modules;

    // TODO use bill of material to resolve specific module versions
    return new SelectedModules(fullCatalog).resolveModules(modules);
  }
}
