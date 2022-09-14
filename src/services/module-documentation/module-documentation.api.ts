import {Module, ModuleDoc} from '../../models';

export abstract class ModuleDocumentationApi {
  abstract generateDocumentation(module: Module): Promise<ModuleDoc>;
}
