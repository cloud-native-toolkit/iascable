import {SingleModuleVersion} from '../../models/module.model';
import {TerraformComponent, TerraformComponentModel} from '../../models/stages.model';
import {BillOfMaterial, BillOfMaterialModel} from '../../models/bill-of-material.model';
import {CatalogModel} from '../../models/catalog.model';

export abstract class TerraformBuilderApi {
  abstract buildTerraformComponent(modules: SingleModuleVersion[], billOfMaterial: BillOfMaterialModel): Promise<TerraformComponent>;
}
