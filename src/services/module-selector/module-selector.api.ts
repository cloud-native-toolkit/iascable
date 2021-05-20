import {BillOfMaterialModel, CatalogFilter, CatalogModel, SingleModuleVersion} from '../../models';

export abstract class ModuleSelectorApi {
  abstract buildBillOfMaterial(fullCatalog: CatalogModel, input?: BillOfMaterialModel, filter?: CatalogFilter): Promise<BillOfMaterialModel>;
  abstract resolveBillOfMaterial(fullCatalog: CatalogModel, input: BillOfMaterialModel): Promise<SingleModuleVersion[]>;
  abstract validateBillOfMaterialModuleConfigYaml(fullCatalog: CatalogModel, moduleRef: string, yaml: string): Promise<void>;
}
