import {CatalogV2Model, Module, ModuleDoc, OutputFile, SingleModuleVersion} from '../../models';

export abstract class ModuleDocumentationApi {
  abstract generateDocumentation(module: Module, catalog: CatalogV2Model, moduleList?: SingleModuleVersion[]): Promise<OutputFile>;
}
