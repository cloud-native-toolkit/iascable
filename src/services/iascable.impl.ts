import {Inject} from 'typescript-ioc';
import {
  IascableApi,
  IascableOptions,
  IascableResult
} from './iascable.api';
import {
  BillOfMaterialModel,
  BillOfMaterialModule,
  isBillOfMaterialModule
} from '../models/bill-of-material.model';
import {SingleModuleVersion, TerraformComponent} from '../models/stages.model';
import {Tile} from '../models/tile.model';
import {LoggerApi} from '../util/logger';
import {Catalog, CatalogLoaderApi} from './catalog-loader';
import {ModuleSelectorApi} from './module-selector';
import {TerraformBuilderApi} from './terraform-builder';
import {TileBuilderApi} from './tile-builder';
import {of as arrayOf} from '../util/array-util'

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

    const bom: BillOfMaterialModel | undefined = interactive ? await this.moduleSelector.buildBillOfMaterial(catalog, input, filter) : input;
    if (!bom) {
      throw new Error('Bill of Material is required');
    }

    const modules: SingleModuleVersion[] = await this.moduleSelector.resolveBillOfMaterial(catalog, bom);

    const billOfMaterial: BillOfMaterialModel = applyVersionsToBomModules(bom, modules);

    const terraformComponent: TerraformComponent = await this.terraformBuilder.buildTerraformComponent(modules, billOfMaterial);

    const tile: Tile | undefined = options?.tileConfig ? await this.tileBuilder.buildTileMetadata(terraformComponent.baseVariables, options.tileConfig) : undefined;

    return {
      billOfMaterial,
      terraformComponent,
      tile,
    };
  }
}

const applyVersionsToBomModules = (billOfMaterial: BillOfMaterialModel, modules: SingleModuleVersion[]): BillOfMaterialModel => {

  const newModules: Array<string | BillOfMaterialModule> = billOfMaterial.spec.modules.map((module: string | BillOfMaterialModule) => {
    const moduleVersion: SingleModuleVersion = findModule(module, modules);

    return mergeBillOfMaterialModule(module, moduleVersion);
  })

  const newSpec = Object.assign({}, billOfMaterial.spec, {modules: newModules});

  return Object.assign({}, billOfMaterial, {spec: newSpec});
}

const findModule = (m: string | BillOfMaterialModule, modules: SingleModuleVersion[]): SingleModuleVersion => {
  const module: BillOfMaterialModule = isBillOfMaterialModule(m) ? m : {id: m};

  return arrayOf(modules)
    .filter(moduleVersion => {
      return module.alias === moduleVersion.alias || module.name === moduleVersion.name || module.id === moduleVersion.id;
    })
    .first()
    .orElseThrow(new Error('Unable to find module: ' + module.name));
}

const mergeBillOfMaterialModule = (module: string | BillOfMaterialModule, moduleVersion: SingleModuleVersion): BillOfMaterialModule => {
  if (isBillOfMaterialModule(module)) {
    return Object.assign({}, module, {version: moduleVersion.version.version});
  }

  const newModule: BillOfMaterialModule = {
    id: module,
    version: moduleVersion.version.version,
  };

  return newModule;
}
