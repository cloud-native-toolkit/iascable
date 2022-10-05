import {
  BillOfMaterialModel,
  CatalogFilter,
  CatalogV1Model,
  CatalogV2Model,
  SingleModuleVersion
} from '../../models';

export abstract class ModuleSelectorApi {
  abstract buildBillOfMaterial(fullCatalog: CatalogV2Model, input?: BillOfMaterialModel, filter?: CatalogFilter): Promise<BillOfMaterialModel>;
  abstract resolveBillOfMaterial(fullCatalog: CatalogV2Model, input: BillOfMaterialModel): Promise<SingleModuleVersion[]>;
  abstract validateBillOfMaterialModuleConfigYaml(fullCatalog: CatalogV2Model, moduleRef: string, yaml: string): Promise<void>;
}
