import {CatalogModel, Module, ModuleDoc} from '../../models';

export abstract class ModuleDocumentationApi {
  abstract generateDocumentation(module: Module, catalog: CatalogModel): Promise<ModuleDoc>;
}
