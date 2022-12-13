import {BillOfMaterialModel, OutputFile} from '../../models';
import {SolutionModel} from '../../models/solution.model';

export abstract class BomDocumentationApi {
  abstract generateDocumentation(bom: BillOfMaterialModel | SolutionModel, name?: string): OutputFile;
}
