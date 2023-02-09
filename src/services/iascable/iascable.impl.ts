import {Container, Inject} from 'typescript-ioc';
import {join} from 'path';
import uniq from 'lodash.uniq';
import uniqBy from 'lodash.uniqby';

import {
  IascableApi,
  IascableBomResult,
  IascableBomResultBase,
  IascableBundle,
  IascableOptions,
  IascableSolutionResult,
  IascableSolutionResultBase,
  isIascableBomResult,
  isIascableSolutionResult,
  WritableBundle
} from './iascable.api';
import {
  BillOfMaterialModel,
  BillOfMaterialModule,
  BillOfMaterialModuleById,
  BillOfMaterialModuleByName,
  BillOfMaterialVariable,
  CustomResourceDefinition,
  DotGraph,
  DotGraphFile,
  getAnnotation,
  getLabel,
  GitIgnoreFile,
  isBillOfMaterialModel,
  isBillOfMaterialModule,
  isSolutionModel,
  Module,
  OutputFile,
  OutputFileType,
  ResourceMetadata,
  SimpleFile,
  SingleModuleVersion,
  Solution,
  SolutionLayerModel,
  SolutionModel,
  TerraformComponentModel,
  TerragruntBase,
  TerragruntLayer,
  Tile,
  UrlFile,
} from '../../models';
import {CatalogLoaderApi} from '../catalog-loader';
import {ModuleSelectorApi} from '../module-selector';
import {DependencyGraphApi} from '../dependency-graph';
import {ModuleDocumentationApi} from '../module-documentation';
import {TerraformBuilderApi} from '../terraform-builder';
import {TileBuilderApi} from '../tile-builder';
import {
  arrayOf,
  ArrayUtil,
  BundleWriter, first,
  flatten, flattenReverse,
  isDefined,
  isDefinedAndNotNull,
  LoggerApi,
  Optional
} from '../../util'
import {
  isSolutionLayerNotFound,
  ModuleNotFound,
  NestedSolutionError,
  SolutionLayerNotFound,
  SolutionLayersNotFound
} from '../../errors';
import {BomReadmeFile, SolutionBomReadmeFile} from '../bom-documentation/bom-documentation.impl';
import {
  BillOfMaterialFile,
  Catalog,
  TerraformTfvarsFile,
  VariablesYamlFile
} from '../../model-impls';
import { LayerNeeds, LayerProvides } from '../../models/layer-dependencies.model'

export class CatalogBuilder implements IascableApi {
  logger: LoggerApi;
  loader: CatalogLoaderApi;
  moduleSelector: ModuleSelectorApi;
  terraformBuilder: TerraformBuilderApi;
  tileBuilder: TileBuilderApi;
  dependencyGraph: DependencyGraphApi;
  docBuilder: ModuleDocumentationApi;

  constructor() {
    this.logger = Container.get(LoggerApi);
    this.loader = Container.get(CatalogLoaderApi);
    this.moduleSelector = Container.get(ModuleSelectorApi);
    this.terraformBuilder = Container.get(TerraformBuilderApi);
    this.tileBuilder = Container.get(TileBuilderApi);
    this.dependencyGraph = Container.get(DependencyGraphApi);
    this.docBuilder = Container.get(ModuleDocumentationApi);
  }

  async build(catalogUrl: string, input?: BillOfMaterialModel, options?: IascableOptions): Promise<IascableBundle> {
    const catalog: Catalog = await this.loader.loadCatalog(catalogUrl);

    if (!input) {
      throw new Error('Bill of Material is required');
    }

    return this.buildBom(catalog, input, options);
  }

  async buildBoms(catalogUrl: string | string[], boms: Array<BillOfMaterialModel | SolutionModel>, options?: IascableOptions): Promise<IascableBundle> {
    const catalog: Catalog = await this.loader.loadCatalog(catalogUrl);

    return this.buildBomsFromCatalog(catalog, boms, options)
  }

  async buildBomsFromCatalog(catalog: Catalog, boms: Array<BillOfMaterialModel | SolutionModel>, options?: IascableOptions): Promise<IascableBundle> {

    if (!boms || boms.length === 0) {
      throw new Error('Bill of Material is required');
    }

    const result: IascableBundle[] = [];

    // for loop here because we don't want them to run on parallel and don't want to use a separate library to
    // throttle
    for (let i = 0; i < boms.length; i++) {
      const bom: BillOfMaterialModel | SolutionModel = boms[i];

      const bomResult: IascableBundle = isBillOfMaterialModel(bom)
        ? await this.buildBom(catalog, bom, options)
        : await this.buildSolution(catalog, bom, options)

      result.push(bomResult)
    }

    return result.reduce(mergeIascableBundles);
  }

  async buildSolution(catalog: Catalog, solutionModel: SolutionModel, options?: IascableOptions): Promise<IascableBundle> {

    const logger: LoggerApi = Container.get(LoggerApi)

    const solution: Solution = Solution.fromModel(solutionModel)
    console.log(`Building solution: ${solution.name}`)

    // Look up each bom from the solution
    const bomLookupResult: Array<BillOfMaterialModel | SolutionModel | SolutionLayerNotFound> = await Promise.all(solution.stack
      .map(async (entry: SolutionLayerModel) => {
        logger.debug('Looking up entry: ', entry)

        const bom: BillOfMaterialModel | SolutionModel | undefined = await catalog.lookupBOM(entry)

        if (!bom) {
          return new SolutionLayerNotFound(entry)
        }

        return bom
      }))

    const inputBoms: Array<BillOfMaterialModel> = handleBomLookupResult(bomLookupResult)

    const result: IascableBundle = await this.buildBomsFromCatalog(catalog, inputBoms, options)
    // if (hasUnmetClusterNeed(result)) {
    //   // if modules need a cluster
    //   const clusterBom: BillOfMaterialModel = (await catalog.lookupBOM({name: '105-existing-openshift'})) as BillOfMaterialModel
    //   const clusterResult: IascableBundle = await this.buildBom(catalog, clusterBom)
    //
    //   result.results.push(...clusterResult.results)
    // }

    return bomBundleToSolutionBundle(solution, result)
  }

  async buildBom(catalog: Catalog, bom: BillOfMaterialModel, options?: IascableOptions): Promise<IascableBundle> {

    const name = bom?.metadata?.name || 'component';
    console.log('  Building bom:', name);

    const modules: SingleModuleVersion[] = await this.moduleSelector.resolveBillOfMaterial(catalog, bom);

    const billOfMaterial: BillOfMaterialModel = applyAnnotationsAndVersionsToBom(bom, modules);

    const terraformComponent: TerraformComponentModel = await this.terraformBuilder.buildTerraformComponent(modules, catalog, billOfMaterial);

    const tile: Tile | undefined = options?.tileConfig ? await this.tileBuilder.buildTileMetadata(terraformComponent.baseVariables, options.tileConfig) : undefined;

    const graph: DotGraph = await this.dependencyGraph.buildFromModules(terraformComponent.modules || modules)

    const result: IascableBomResult = new IascableBomResultImpl({
      billOfMaterial: terraformComponent.billOfMaterial || billOfMaterial,
      terraformComponent,
      tile,
      graph: new DotGraphFile(graph),
      supportingFiles: [
        new UrlFile({name: 'apply.sh', url: 'https://raw.githubusercontent.com/cloud-native-toolkit/automation-solutions/main/common-files/apply-terragrunt-variables.sh', type: OutputFileType.executable}),
        new UrlFile({name: 'destroy.sh', url: 'https://raw.githubusercontent.com/cloud-native-toolkit/automation-solutions/main/common-files/destroy-terragrunt.sh', type: OutputFileType.executable}),
        new BomReadmeFile(billOfMaterial, terraformComponent.modules, terraformComponent),
      ]
    });

    return new IascableBundleImpl({
      results: [result],
      supportingFiles: [
        new UrlFile({name: 'launch.sh', url: 'https://raw.githubusercontent.com/cloud-native-toolkit/automation-solutions/main/common-files/launch.sh', type: OutputFileType.executable}),
        new GitIgnoreFile(),
      ]
    })
  }

  async moduleDocumentation(catalogUrl: string | string[], moduleName: string, options?: IascableOptions): Promise<OutputFile> {
    const catalog: Catalog = await this.loader.loadCatalog(catalogUrl);

    const module: Module | undefined = await catalog.lookupModule({name: moduleName})

    if (!module) {
      throw new ModuleNotFound(catalogUrl, moduleName)
    }

    return this.docBuilder.generateDocumentation(module, catalog)
  }
}

const matchingBomModule = (module: SingleModuleVersion) => (bomModule: BillOfMaterialModule): boolean => {
  return (!!bomModule.alias && bomModule.alias === module.alias) || (!bomModule.alias && bomModule.name === module.name || bomModule.id === module.id)
}

const applyAnnotationsAndVersionsToBom = (billOfMaterial: BillOfMaterialModel, modules: SingleModuleVersion[]): BillOfMaterialModel => {
  const versionedBom: BillOfMaterialModel = applyVersionsToBomModules(billOfMaterial, modules)

  return applyAnnotationsToBom(versionedBom, modules)
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

const applyAnnotationsToBom = (billOfMaterial: BillOfMaterialModel, modules: SingleModuleVersion[]): BillOfMaterialModel => {

  const provides: LayerProvides[] = uniqBy(modules
    .map(extractProvidedCapabilities)
    .reduce(
      flattenReverse,
      extractProvidedCapabilitiesFromBom(billOfMaterial)
    ),
    'name'
  )
  const needs: LayerNeeds[] = uniqBy(modules
    .map(extractNeededCapabilities(provides))
    .reduce(
      flattenLayerNeeds,
      extractNeededCapabilitiesFromBom(billOfMaterial)
    ),
    'name'
  )

  const metadata: ResourceMetadata = billOfMaterial.metadata || {name: 'bom'}
  const annotations: {[name: string]: string} = metadata.annotations || {}

  if (provides.length > 0) {
    annotations['dependencies.cloudnativetoolkit.dev/provides'] = provides.map(val => val.name).join(',')
  }
  if (needs.length > 0) {
    annotations['dependencies.cloudnativetoolkit.dev/needs'] = needs.map(val => val.name).join(',')
  }

  provides
    .filter(provide => !!provide.alias)
    .forEach(provide => {
      annotations[`dependencies.cloudnativetoolkit.dev/provides_${provide.name}`] = provide.alias
    })
  needs
    .filter(need => need.aliases && need.aliases.length > 0)
    .forEach(need => {
      annotations[`dependencies.cloudnativetoolkit.dev/needs_${need.name}`] = need.aliases.join(',')
    })

  metadata.annotations = annotations
  billOfMaterial.metadata = metadata

  return billOfMaterial
}

const flattenLayerNeeds = (result: LayerNeeds[], current: LayerNeeds[] = []) => {
  current.forEach(need => {
    first(result.filter(val => val.name === need.name))
      .ifPresent(origNeed => origNeed.aliases = uniq(origNeed.aliases.concat(...need.aliases)))
      .ifNotPresent(() => result.push(need))
  })

  return result
}

export const extractProvidedCapabilitiesFromBom = (bom: CustomResourceDefinition): LayerProvides[] => {
  const providesAnnotation: string = getAnnotation(bom, 'dependencies.cloudnativetoolkit.dev/provides') || ''

  return providesAnnotation.split(',').filter(v => !!v).map(name => {
    const alias: string = getAnnotation(bom, `dependencies.cloudnativetoolkit.dev/provides_${name}`) || defaultProvidesAlias(name)

    return {name, alias}
  })
}

const defaultProvidesAlias = (name: string): string => {
  if (name === 'gitops') {
    return 'gitops_repo_config'
  }

  return name
}

export const extractNeededCapabilitiesFromBom = (bom: CustomResourceDefinition): LayerNeeds[] => {
  const needsAnnotation: string = getAnnotation(bom, 'dependencies.cloudnativetoolkit.dev/needs') || ''

  return needsAnnotation.split(',').filter(v => !!v).map(name => {
    const aliasesAnnotation: string = getAnnotation(bom, `dependencies.cloudnativetoolkit.dev/needs_${name}`) || ''

    return {name, aliases: aliasesAnnotation.split(',').filter(v => !!v)}
  })
}

const extractProvidedCapabilities = (module: SingleModuleVersion): LayerProvides[] => {
  const provides: LayerProvides[] = []

  // TODO this should be completely based on interfaces
  const interfaces: string[] = (module.interfaces || [])
    .map(value => value.replace(/.*#/, ''))

  if (interfaces.includes('cluster') && module.name !== 'ocp-login') {
    provides.push({name: 'cluster', alias: module.alias || module.name})
  }

  if (interfaces.includes('gitops-provider') || module.name === 'argocd-bootstrap') {
    provides.push({name: 'gitops', alias: module.alias || module.name})
  }

  if (interfaces.includes('cluster-storage')) {
    provides.push({name: 'storage', alias: module.alias || module.name})
  }

  return provides
}

const extractNeededCapabilities = (allProvides: LayerProvides[]) => {
  const provides: string[] = allProvides.map(val => val.name)

  return (module: SingleModuleVersion): LayerNeeds[] => {
    const needs: LayerNeeds[] = []

    const interfaces: string[] = (module.interfaces || [])
      .map(value => value.replace(/.*#/, ''))

    // TODO this should be completely based on interfaces
    if (module.name === 'ocp-login' && !provides.includes('cluster')) {
      needs.push({name: 'cluster', aliases: [module.alias || module.name]})
    }

    // TODO this should be based on interfaces as well
    if (module.name === 'gitops-repo' && !provides.includes('gitops')) {
      needs.push({name: 'gitops', aliases: [module.alias || module.name]})
    }

    if (interfaces.includes('storage-consumer') && !provides.includes('storage')) {
      needs.push({name: 'storage', aliases: [module.alias || module.name]})
    }

    return needs
  }
}

const mergeIascableBundles = (bundle: IascableBundle, current: IascableBundle): IascableBundle => {

  const results: Array<IascableBomResult | IascableSolutionResult> = uniqBy(
    current.results.concat(...bundle.results),
    (result: IascableBomResult | IascableSolutionResult) => getBomPath(result.billOfMaterial))

  const supportingFiles: OutputFile[] = uniqBy(
    current.supportingFiles.concat(...bundle.supportingFiles),
    (file: OutputFile) => file.name
  )

  return new IascableBundleImpl({
    results,
    supportingFiles
  })
}

class IascableBundleImpl implements IascableBundle {
  results: Array<IascableBomResult | IascableSolutionResult>;
  supportingFiles: OutputFile[];

  constructor({results = [], supportingFiles = []}: {results: Array<IascableBomResult | IascableSolutionResult>, supportingFiles?: OutputFile[]}) {
    this.results = results;
    this.supportingFiles = supportingFiles
  }

  writeBundle(baseWriter: BundleWriter, options: {flatten: boolean} = {flatten: false}): BundleWriter {

    this.results.forEach((result: WritableBundle) => {
      result.writeBundle(baseWriter, options)
    })

    writeFiles(baseWriter, this.supportingFiles, options)

    return baseWriter
  }
}

class IascableBomResultImpl implements IascableBomResult {
  billOfMaterial: BillOfMaterialModel;
  terraformComponent: TerraformComponentModel;
  supportingFiles: OutputFile[];
  graph?: DotGraphFile;
  tile?: Tile;
  inSolution?: boolean;

  constructor(params: IascableBomResultBase) {
    this.billOfMaterial = params.billOfMaterial
    this.terraformComponent = params.terraformComponent
    this.supportingFiles = params.supportingFiles || []
    this.graph = params.graph
    this.tile = params.tile
  }

  writeBundle(baseWriter: BundleWriter, inOptions: { flatten?: boolean } = {flatten: false}): BundleWriter {
    const writer: BundleWriter = baseWriter.folder(getBomPath(this.billOfMaterial))

    const options = Object.assign({}, inOptions, {inSolution: this.inSolution})

    writeFiles(
      options.flatten ? writer : writer.folder('terraform'),
      this.terraformComponent.files,
      options,
    )

    writeFiles(
      writer,
      [
        new BillOfMaterialFile(this.billOfMaterial),
        this.graph,
        this.tile?.file,
      ],
      options,
    )

    writeFiles(writer, this.supportingFiles, options)

    if (!this.inSolution) {
      const terraformVariables: BillOfMaterialVariable[] = (this.billOfMaterial.spec.variables || [])
        .filter(v => !v.sensitive)
      const sensitiveVariables: BillOfMaterialVariable[] = (this.billOfMaterial.spec.variables || [])
        .filter(v => v.sensitive)

      writeFiles(
        writer, [
          new TerraformTfvarsFile(terraformVariables, this.billOfMaterial.spec.variables, 'terraform.template.tfvars'),
          new TerraformTfvarsFile(sensitiveVariables, this.billOfMaterial.spec.variables, 'credentials.auto.template.tfvars'),
          new VariablesYamlFile({name: 'variables.template.yaml', variables: this.terraformComponent.billOfMaterial?.spec.variables || []})
        ],
        options
      )
    }

    return writer
  }
}

class IascableSolutionResultImpl implements IascableSolutionResult {
  billOfMaterial: SolutionModel;
  results: IascableBomResult[];
  supportingFiles: OutputFile[];

  _solution: Solution;
  _boms: BillOfMaterialModel[];

  constructor(params: IascableSolutionResultBase) {
    this.results = params.results
    this.billOfMaterial = applyLayerVersions(params.billOfMaterial, this.results)
    this.supportingFiles = params.supportingFiles || []

    this._solution = Solution.fromModel(params.billOfMaterial)

    const terraform: TerraformComponentModel[] = this.results
      .map(result => result.terraformComponent)

    this._boms = terraform
      .map(terraform => terraform.billOfMaterial)
      .filter(isDefined)
      .map(bom => bom as BillOfMaterialModel)

    this.addTerragruntConfig()
    this._solution.terraform = terraform

    this.addSpecFiles()
    this.addSupportFiles()
    this.addTerraformTfvars()
  }

  addTerragruntConfig(): void {
    this.supportingFiles.push(new TerragruntBase())
    this.results
      .map(result => result.terraformComponent)
      .filter(terraformComponent => !!terraformComponent.billOfMaterial)
      .forEach(terraformComponent => {
        terraformComponent.terragrunt = new TerragruntLayer({
          currentBom: terraformComponent.billOfMaterial as BillOfMaterialModel,
          boms: this._boms
        })
      })
  }

  addSpecFiles(): void {
    (this._solution.spec.files || []).forEach(file => {
      if (file.contentUrl) {
        this.supportingFiles.push(new UrlFile({name: file.name, url: file.contentUrl, type: fileType(file.type)}))
      } else if (file.content) {
        this.supportingFiles.push(new SimpleFile({name: file.name, contents: file.content, type: fileType(file.type)}))
      }
    })
  }

  addSupportFiles(): void {
    this.supportingFiles.push(new UrlFile({name: 'apply.sh', type: OutputFileType.executable, url: 'https://raw.githubusercontent.com/cloud-native-toolkit/automation-solutions/main/common-files/apply-all-terragrunt-variables.sh'}))
    this.supportingFiles.push(new UrlFile({name: 'destroy.sh', type: OutputFileType.executable, url: 'https://raw.githubusercontent.com/cloud-native-toolkit/automation-solutions/main/common-files/destroy-all-terragrunt.sh'}))
    this.supportingFiles.push(new SolutionBomReadmeFile(this.billOfMaterial))
  }

  addTerraformTfvars(): void {
    const terraformVariables: BillOfMaterialVariable[] = this.billOfMaterial.spec.variables
      .filter(v => !v.sensitive)
    const sensitiveVariables: BillOfMaterialVariable[] = this.billOfMaterial.spec.variables
      .filter(v => v.sensitive)

    this.supportingFiles.push(...[
      new TerraformTfvarsFile(terraformVariables, this.billOfMaterial.spec.variables, 'terraform.template.tfvars'),
      new TerraformTfvarsFile(sensitiveVariables, this.billOfMaterial.spec.variables, 'credentials.auto.template.tfvars'),
      new VariablesYamlFile({name: 'variables.template.yaml', variables: terraformVariables})
    ])
  }

  writeBundle(bundleWriter: BundleWriter, options?: { flatten: boolean }): BundleWriter {
    const solutionWriter: BundleWriter = bundleWriter.folder(getBomPath(this.billOfMaterial, 'solution'))

    writeFile(solutionWriter, this._solution.asFile());

    this.results.forEach((result: IascableBomResult) => {
      result.writeBundle(solutionWriter, options)
    })

    writeFiles(solutionWriter, this.supportingFiles)

    return solutionWriter
  }
}

const applyLayerVersions = (bom: SolutionModel, bomResults: IascableBomResult[]): SolutionModel => {
  const bomArray: ArrayUtil<IascableBomResult> = ArrayUtil.of(bomResults)

  const layers: SolutionLayerModel[] = bom.spec.stack
    .map(layer => {
      const bomResult: Optional<IascableBomResult> = bomArray
        .filter(matchIascableBomResult(layer.name))
        .first()

      if (!bomResult.isPresent()) {
        return layer
      }

      const layerBom: BillOfMaterialModel = bomResult.map(result => result.billOfMaterial).get()

      return Object.assign(layer, {
        layer: getLabel(layerBom, 'type') || layer.layer,
        description: getAnnotation(layerBom, 'description') || layer.description,
        version: layerBom.spec.version
      })
    })

  bom.spec.stack = layers

  return bom
}

const matchIascableBomResult = (layerName: string) => {
  return (result: IascableBomResult): boolean => {
    return result.billOfMaterial.metadata?.name === layerName
  }
}

const getBomPath = (bom: CustomResourceDefinition, defaultName: string = 'component'): string => {
  const pathParts: string[] = [
    getAnnotation(bom, 'path') || '',
    formatName(bom.metadata?.name || defaultName)
  ]
    .filter(v => !!v)

  return join(...pathParts)
}

const formatName = (name: string): string => {
  return name.toLowerCase().replace(/ +/g, '-')
}

const writeFiles = (writer: BundleWriter, files: Array<OutputFile | undefined> = [], options?: {flatten?: boolean}) => {
  files
    .filter(f => isDefinedAndNotNull(f))
    .map(f => f as OutputFile)
    .forEach(writeFilesWithWriter(writer, options))
}

const writeFilesWithWriter = (writer: BundleWriter, options?: {flatten?: boolean}) => {
  return (file: OutputFile) => {
    writeFile(writer, file, options)
  }
}

const writeFile = (writer: BundleWriter, file: OutputFile, options?: {flatten?: boolean}) => {
  writer.file(file.name, file.contents(options), {executable: file.type === OutputFileType.executable})
}

const handleBomLookupResult = (result: Array<BillOfMaterialModel | SolutionModel | SolutionLayerNotFound>): Array<BillOfMaterialModel> => {
  const bomErrors: SolutionLayerNotFound[] = result.filter(v => isSolutionLayerNotFound(v)).map(v => v as SolutionLayerNotFound)
  if (bomErrors.length > 0) {
    throw new SolutionLayersNotFound(bomErrors)
  }

  return flattenSolutions(result as Array<BillOfMaterialModel | SolutionModel>)
}

const flattenSolutions = (result: Array<BillOfMaterialModel | SolutionModel>): BillOfMaterialModel[] => {

  // TODO eventually we will extract each of the BOMs from the solution and merge all the BOMs together

  const solutions: SolutionModel[] = result.filter(v => isSolutionModel(v)).map(v => v as SolutionModel)
  if (solutions.length > 0) {
    throw new NestedSolutionError()
  }

  return result as BillOfMaterialModel[]
}

const fileType = (type: string): OutputFileType | undefined => {
  switch (type) {
    case 'doc':
      return OutputFileType.documentation
    case 'script':
      return OutputFileType.executable
    default:
      return
  }
}

const hasUnmetClusterNeed = (bundle: IascableBundle): boolean => {
  const needs: LayerNeeds[] = uniq(
    bundle.results
      .map(result => result.billOfMaterial)
      .map(bom => extractNeededCapabilitiesFromBom(bom))
      .reduce(flatten, [])
  )

  const provides: LayerProvides[] = uniq(
    bundle.results
      .map(result => result.billOfMaterial)
      .map(bom => extractProvidedCapabilitiesFromBom(bom))
      .reduce(flatten, [])
  )

  return needs.map(need => need.name).includes('cluster') &&
    !provides.map(provide => provide.name).includes('cluster')
}

const bomBundleToSolutionBundle = (solution: Solution, bundle: IascableBundle): IascableBundle => {
  const results: IascableBomResult[] = bundle.results
    .filter(isIascableBomResult)
    .map(r => Object.assign(r, {inSolution: true}))
  const solutionResults: IascableSolutionResult[] = bundle.results
    .filter(isIascableSolutionResult)

  solutionResults.push(new IascableSolutionResultImpl({billOfMaterial: solution, results}))

  return new IascableBundleImpl({
    results: solutionResults,
    supportingFiles: bundle.supportingFiles
  })
}
