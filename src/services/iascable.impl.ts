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
import {Module, SingleModuleVersion, TerraformComponent} from '../models/stages.model';
import {Tile} from '../models/tile.model';
import {LoggerApi} from '../util/logger';
import {Catalog, CatalogLoaderApi} from './catalog-loader';
import {ModuleSelectorApi} from './module-selector';
import {TerraformBuilderApi} from './terraform-builder';
import {TileBuilderApi} from './tile-builder';
import {ArrayUtil, of as arrayOf} from '../util/array-util/array-util'
import {Optional} from '../util/optional';
import {DependencyGraphApi} from './dependency-graph';
import {DotGraph, DotGraphFile} from '../models/graph.model';
import {ModuleDoc, OutputFile} from '../models';
import {ModuleDocumentationApi} from './module-documentation';
import {ModuleNotFound} from '../errors';

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
  @Inject
  dependencyGraph!: DependencyGraphApi;
  @Inject
  docBuilder!: ModuleDocumentationApi;

  async build(catalogUrl: string, input?: BillOfMaterialModel, options?: IascableOptions): Promise<IascableResult> {
    const catalog: Catalog = await this.loader.loadCatalog(catalogUrl);

    if (!input) {
      throw new Error('Bill of Material is required');
    }

    return this.buildBom(catalog, input, options);
  }

  async buildBoms(catalogUrl: string | string[], boms: BillOfMaterialModel[], options?: IascableOptions): Promise<IascableResult[]> {
    const catalog: Catalog = await this.loader.loadCatalog(catalogUrl);

    if (!boms || boms.length === 0) {
      throw new Error('Bill of Material is required');
    }

    const result: IascableResult[] = [];

    // for loop here because we don't want them to run on parallel and don't want to use a separate library to
    // throttle
    for (let i = 0; i < boms.length; i++) {
      const bom: BillOfMaterialModel = boms[i];

      const name = bom?.metadata?.name || 'component';
      console.log('Name:', name);

      const bomResult = await this.buildBom(catalog, bom, options);

      result.push(bomResult)
    }

    return result;
  }

  async buildBom(catalog: Catalog, bom: BillOfMaterialModel, options?: IascableOptions): Promise<IascableResult> {

    const modules: SingleModuleVersion[] = await this.moduleSelector.resolveBillOfMaterial(catalog, bom);

    const billOfMaterial: BillOfMaterialModel = applyVersionsToBomModules(bom, modules);

    const terraformComponent: TerraformComponent = await this.terraformBuilder.buildTerraformComponent(modules, catalog, billOfMaterial);

    const tile: Tile | undefined = options?.tileConfig ? await this.tileBuilder.buildTileMetadata(terraformComponent.baseVariables, options.tileConfig) : undefined;

    const graph: DotGraph = await this.dependencyGraph.buildFromModules(terraformComponent.modules || modules)

    return {
      billOfMaterial: terraformComponent.billOfMaterial || billOfMaterial,
      terraformComponent,
      tile,
      graph: new DotGraphFile(graph)
    };
  }

  async moduleDocumentation(catalogUrl: string | string[], moduleName: string, options?: IascableOptions): Promise<ModuleDoc> {
    const catalog: Catalog = await this.loader.loadCatalog(catalogUrl);

    const module: Module | undefined = await catalog.lookupModule({name: moduleName})

    if (!module) {
      throw new ModuleNotFound(catalogUrl, moduleName)
    }

    return this.docBuilder.generateDocumentation(module, catalog)
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
