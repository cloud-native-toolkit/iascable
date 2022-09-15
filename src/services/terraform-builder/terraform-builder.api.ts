import {
  BillOfMaterialModel,
  CatalogModel,
  SingleModuleVersion,
  TerraformComponent
} from '../../models';

export abstract class TerraformBuilderApi {
  abstract buildTerraformComponent(modules: SingleModuleVersion[], catalogModel: CatalogModel, billOfMaterial?: BillOfMaterialModel): Promise<TerraformComponent>;
}
