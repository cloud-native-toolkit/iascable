import {CatalogModel, Module, ModuleDoc, SingleModuleVersion} from '../../models';

export abstract class ModuleDocumentationApi {
  abstract generateDocumentation(module: Module, catalog: CatalogModel, moduleList?: SingleModuleVersion[]): Promise<ModuleDoc>;
}
