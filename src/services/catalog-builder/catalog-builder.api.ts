// @ts-ignore
import {Observable} from 'rxjs'
import {BillOfMaterialEntry, Module, ModuleIdAlias, ProviderModel} from '../../models';

export interface CatalogBuilderParams {
  moduleMetadataUrl?: string
  catalogInput?: string
  category: string
}

export interface CatalogBuilderResult {
  kind: string
  apiVersion: string
  providers: Observable<ProviderModel>
  aliases: Observable<ModuleIdAlias>
  modules: Observable<Module>
  boms: Observable<BillOfMaterialEntry>
}

export abstract class CatalogBuilderApi {
  abstract build(params: CatalogBuilderParams): CatalogBuilderResult
}
