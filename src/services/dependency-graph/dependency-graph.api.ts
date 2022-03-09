import {BillOfMaterialModel, SingleModuleVersion} from '../../models';
import {DotGraph} from '../../models/graph.model';

export abstract class DependencyGraphApi {
  abstract buildFromBom(billOfMaterial: BillOfMaterialModel, catalogUrl?: string): Promise<DotGraph>;
  abstract buildFromModules(modules: SingleModuleVersion[]): Promise<DotGraph>;
}
