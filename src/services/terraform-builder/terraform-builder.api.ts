import {
  BillOfMaterialModel,
  CatalogModel,
  SingleModuleVersion,
  TerraformComponent
} from '../../models';

export abstract class TerraformBuilderApi {
  abstract buildTerraformComponent(modules: SingleModuleVersion[], billOfMaterial?: BillOfMaterialModel, catalogModel?: CatalogModel): Promise<TerraformComponent>;
}
