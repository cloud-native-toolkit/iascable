import {Inject} from 'typescript-ioc';
import {
  IascableApi,
  IascableOptions,
  IascableResult
} from './iascable.api';
import {BillOfMaterialModel} from '../models/bill-of-material.model';
import {SingleModuleVersion, TerraformComponent} from '../models/stages.model';
import {Tile} from '../models/tile.model';
import {LoggerApi} from '../util/logger';
import {Catalog, CatalogLoaderApi} from './catalog-loader';
import {ModuleSelectorApi} from './module-selector';
import {TerraformBuilderApi} from './terraform-builder';
import {TileBuilderApi} from './tile-builder';

export class CatalogBuilder implements IascableApi {
  @Inject
  logger!: LoggerApi;
  @Inject
  loader!: CatalogLoaderApi;
  @Inject
  moduleSelector!: ModuleSelectorApi;
  @Inject
  terraformBuilder!: TerraformBuilderApi;
  @Inject
  tileBuilder!: TileBuilderApi;

  async build(catalogUrl: string, input?: BillOfMaterialModel, options?: IascableOptions): Promise<IascableResult> {
    const catalog: Catalog = await this.loader.loadCatalog(catalogUrl);

    const interactive: boolean = !!(options?.interactive);
    const filter: {platform?: string; provider?: string} = options?.filter ? options.filter : {};

    const billOfMaterial: BillOfMaterialModel | undefined = interactive ? await this.moduleSelector.buildBillOfMaterial(catalog, input, filter) : input;
    if (!billOfMaterial) {
      throw new Error('Bill of Material is required');
    }

    const modules: SingleModuleVersion[] = await this.moduleSelector.resolveBillOfMaterial(catalog, billOfMaterial);

    const terraformComponent: TerraformComponent = await this.terraformBuilder.buildTerraformComponent(modules, billOfMaterial);

    const tile: Tile | undefined = options?.tileConfig ? await this.tileBuilder.buildTileMetadata(terraformComponent.baseVariables, options.tileConfig) : undefined;

    return {
      billOfMaterial,
      terraformComponent,
      tile,
    };
  }
}
