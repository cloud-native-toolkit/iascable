import {
  BillOfMaterialModel,
  CatalogV2Model,
  SingleModuleVersion,
  TerraformComponent
} from '../../models';

export abstract class TerraformBuilderApi {
  abstract buildTerraformComponent(modules: SingleModuleVersion[], catalogModel: CatalogV2Model, billOfMaterial?: BillOfMaterialModel): Promise<TerraformComponent>;
}
