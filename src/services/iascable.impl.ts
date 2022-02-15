import {Inject} from 'typescript-ioc';
import {
  IascableApi,
  IascableOptions,
  IascableResult
} from './iascable.api';
import {
  BillOfMaterialModel,
  BillOfMaterialModule, BillOfMaterialModuleById, BillOfMaterialModuleByName,
  isBillOfMaterialModule
} from '../models/bill-of-material.model';
import {SingleModuleVersion, TerraformComponent} from '../models/stages.model';
import {Tile} from '../models/tile.model';
import {LoggerApi} from '../util/logger';
import {Catalog, CatalogLoaderApi} from './catalog-loader';
import {ModuleSelectorApi} from './module-selector';
import {TerraformBuilderApi} from './terraform-builder';
import {TileBuilderApi} from './tile-builder';
import {ArrayUtil, of as arrayOf} from '../util/array-util'
import {Optional} from '../util/optional';

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

const matchingBomModule = (module: SingleModuleVersion) => (bomModule: BillOfMaterialModule): boolean => {
  const result = (!!bomModule.alias && bomModule.alias === module.alias) || (!bomModule.alias && bomModule.name === module.name || bomModule.id === module.id)

  return result
}

const applyVersionsToBomModules = (billOfMaterial: BillOfMaterialModel, modules: SingleModuleVersion[]): BillOfMaterialModel => {

  const bomModules: ArrayUtil<BillOfMaterialModuleById | BillOfMaterialModuleByName> = arrayOf(billOfMaterial.spec.modules)
    .filter(b => isBillOfMaterialModule(b))
    .map(b => b as any)

  const newModules: Array<BillOfMaterialModule> = modules
    .map((module: SingleModuleVersion) => {
      const existingBomModule: Optional<BillOfMaterialModule> = bomModules
        .filter(matchingBomModule(module))
        .first()

      const bomModule: BillOfMaterialModule = Object.assign(
        {
          name: module.name,
          alias: module.alias,
          version: module.version.version
        },
        existingBomModule.orElse({} as any)
      )

      return bomModule
    }, [])

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
