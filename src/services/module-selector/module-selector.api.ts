import {CatalogModel} from '../catalog-loader';
import {BillOfMaterialModel} from '../../models/bill-of-material.model';
import {SingleModuleVersion} from '../../models/module.model';

export abstract class ModuleSelectorApi {
  abstract buildBillOfMaterial(fullCatalog: CatalogModel, input?: BillOfMaterialModel, filter?: {platform?: string, provider?: string}): Promise<BillOfMaterialModel>;
  abstract resolveBillOfMaterial(fullCatalog: CatalogModel, input: BillOfMaterialModel): Promise<SingleModuleVersion[]>;
  abstract validateBillOfMaterialModuleConfigYaml(fullCatalog: CatalogModel, moduleRef: string, yaml: string): Promise<void>;
}
