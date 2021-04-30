import {CatalogModel} from '../catalog-loader';
import {BillOfMaterialModel, BillOfMaterialModule} from '../../models/bill-of-material.model';
import {SingleModuleVersion} from '../../models/module.model';

export abstract class ModuleSelectorApi {
  abstract buildBillOfMaterial(fullCatalog: CatalogModel, input?: BillOfMaterialModel, filter?: { platform?: string, provider?: string }): Promise<BillOfMaterialModel>;

  abstract resolveBillOfMaterial(fullCatalog: CatalogModel, input: BillOfMaterialModel): Promise<SingleModuleVersion[]>;

  abstract validateBillOfMaterialModuleConfigYaml(fullCatalog: CatalogModel, moduleRef: string, yaml: string): Promise<string>;

  abstract validateBillOfMaterial(catalogModel: CatalogModel, bom: BillOfMaterialModel): Promise<Array<string | Error>>;

  abstract validateBillOfMaterialModuleConfig(catalogModel: CatalogModel, moduleConfig: BillOfMaterialModule): Promise<string>;
}
