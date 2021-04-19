import {BillOfMaterialModel, SingleModuleVersion, TerraformComponent} from '../../models';

export abstract class TerraformBuilderApi {
  abstract buildTerraformComponent(modules: SingleModuleVersion[], billOfMaterial?: BillOfMaterialModel): Promise<TerraformComponent>;
}
