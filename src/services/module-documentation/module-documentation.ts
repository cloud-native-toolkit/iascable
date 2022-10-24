import {join} from 'path';
import {Container, Inject} from 'typescript-ioc';

import {ModuleDocumentationApi} from './module-documentation.api';
import {TerraformBuilderApi} from '../terraform-builder';
import {SelectedModuleResolverImpl} from '../module-selector/selected-modules.resolver';
import {
  Catalog,
  CatalogV2Model,
  Module,
  ModuleOutputRef,
  ModuleVariable,
  ModuleVersion,
  OutputFile,
  OutputFileType,
  SingleModuleVersion,
  Stage,
  TerraformComponent
} from '../../models';
import {getIascableVersion} from '../../util/iascable-version';
import {isUndefined} from '../../util/object-util';
import {ModuleVersionNotFound} from '../../util/version-resolver';
import {ModuleReadmeTemplate, PrintableVariable, TemplatedFile} from '../../template-models/models';

export class ModuleDocumentation implements ModuleDocumentationApi {
  @Inject
  terraformBuilder!: TerraformBuilderApi;

  async generateDocumentation(module: Module, catalogModel: CatalogV2Model, moduleList?: SingleModuleVersion[], name?: string): Promise<OutputFile> {
    return new ModuleReadmeFile(module, catalogModel, moduleList, name)
  }
}

export class ModuleReadmeFile extends TemplatedFile {

  terraformBuilder: TerraformBuilderApi;

  constructor(private module: Module, private catalogModel: CatalogV2Model, private moduleList?: SingleModuleVersion[], name: string = 'README.md') {
    super(name, OutputFileType.documentation, join(__dirname, '../../templates/module-readme.liquid'));

    this.terraformBuilder = Container.get(TerraformBuilderApi)
  }

  get model(): Promise<ModuleReadmeTemplate> {

    const catalog: Catalog = Catalog.fromModel(this.catalogModel)

    const currentVersion: ModuleVersion = this.latestModuleVersion(this.module)

    return new Promise(async (resolve, reject) => {
      try {
        const example: string = await this.example(this.module, catalog, this.moduleList)

        resolve({
          name: this.module.displayName || this.module.name,
          description: this.module.description || '',
          documentation: this.module.documentation || '',
          terraformVersion: this.terraformVersion(currentVersion),
          providers: currentVersion.providers || [],
          dependencies: currentVersion.dependencies || [],
          example,
          variables: this.variables(currentVersion.variables),
          outputs: currentVersion.outputs,
          license: this.module.license || 'Apache License 2.0',
          iascableVersion: getIascableVersion(),
        })
      } catch (err) {
        reject(err)
      }
    })
  }

  latestModuleVersion(module: Module): ModuleVersion {
    if (!module.versions || module.versions.length === 0) {
      throw new ModuleVersionNotFound(module, 'latest')
    }

    return module.versions[0]
  }

  terraformVersion(moduleVersion: ModuleVersion): string {
    return (moduleVersion.terraformVersion || '>= v0.15').replace('>', '\\>')
  }

  variables(variables: ModuleVariable[] = []): PrintableVariable[] {

    const moduleSource = (ref?: ModuleOutputRef): string => {
      if (!ref) {
        return ''
      }

      return `${ref.id}.${ref.output}`
    }

    return variables.map(v => {
      const pv: PrintableVariable = {
        name: v.name,
        description: v.description || '',
        required: isUndefined(v.default || v.defaultValue),
        defaultValue: v.default || v.defaultValue || '',
        source: moduleSource(v.moduleRef)
      }

      return pv
    })
  }

  async example(module: Module, catalog: Catalog, moduleList?: SingleModuleVersion[]): Promise<string> {
    const modules: SingleModuleVersion[] = moduleList ? moduleList : new SelectedModuleResolverImpl(catalog).resolve([module])

    const terraform: TerraformComponent = await this.terraformBuilder.buildTerraformComponent(modules, catalog)

    const currentStage: Stage[] = Object.values(terraform.stages).filter(stage => stage.source === module.id)

    if (!currentStage || currentStage.length === 0) {
      return ''
    }

    currentStage[0].module.version.version = ''

    return currentStage[0].asString(terraform.stages)
  }

}
