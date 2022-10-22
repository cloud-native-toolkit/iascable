import {join} from 'path'

import {BomDocumentationApi} from './bom-documentation.api';
import {
  BillOfMaterialModel,
  BillOfMaterialModule,
  OutputFile,
  OutputFileType,
  SingleModuleVersion
} from '../../models';
import {isSolutionModel, SolutionModel} from '../../models/solution.model';
import {getAnnotation} from '../../models/crd.model';
import {
  BomTemplateModel,
  PrintableBillOfMaterialModule,
  SolutionTemplateModel,
  TemplatedFile
} from '../../template-models/models';
import {isUndefined} from '../../util/object-util';
import {ArrayUtil} from '../../util/array-util';
import {Optional} from '../../util/optional';

export class BomDocumentationImpl implements BomDocumentationApi {
  generateDocumentation(bom: BillOfMaterialModel | SolutionModel, name?: string): OutputFile {
    if (isSolutionModel(bom)) {
      return new SolutionBomReadmeFile(bom, name)
    } else {
      return new BomReadmeFile(bom, [], name)
    }
  }
}

export class BomReadmeFile extends TemplatedFile {

  constructor(private bom: BillOfMaterialModel, private modules?: SingleModuleVersion[], name: string = 'README.md') {
    super(name, OutputFileType.documentation, join(__dirname, '../../templates/bom-readme.liquid'))
  }

  get model(): Promise<BomTemplateModel> {
    return Promise.resolve({
      name: this.bom.metadata?.name || 'Bill of Material',
      description: getAnnotation(this.bom, 'description') || '',
      documentation: getAnnotation(this.bom, 'documentation'),
      diagram: getAnnotation(this.bom, 'files.cloudnativetoolkit.dev/diagram'),
      vpn: false,
      variables: this.bom.spec.variables || [],
      modules: (this.bom.spec.modules as BillOfMaterialModule[] || []).map(bomModuleToPrintable(this.modules))
    })
  }
}

const bomModuleToPrintable = (modules: SingleModuleVersion[] = []) => {
  const moduleArray: ArrayUtil<SingleModuleVersion> = ArrayUtil.of(modules)

  return (module: BillOfMaterialModule): PrintableBillOfMaterialModule => {
    const fullModule: Optional<SingleModuleVersion> = moduleArray
      .filter(m => m.name === module.name)
      .first()

    if (!fullModule.isPresent()) {
      console.log(' *** No module found: ' + module.name, modules.map(m => m.name))
      return module as PrintableBillOfMaterialModule
    }

    const moduleId = fullModule.get().id
    const description = (fullModule.get().description || '')
      .replace(/\r\n/mg, ' ')
      .replace(/\n/mg, ' ')
      .replace(/([^.]+[.]).*/mg, '$1')

    const url = moduleId.startsWith('file:') ? moduleId : `https://${moduleId}`

    return Object.assign(module, {url, description}) as PrintableBillOfMaterialModule
  }
}

export class SolutionBomReadmeFile extends TemplatedFile {

  constructor(private bom: SolutionModel, name: string = 'README.md') {
    super(name, OutputFileType.documentation, join(__dirname, '../../templates/solution-readme.liquid'))
  }

  get model(): Promise<SolutionTemplateModel> {
    return Promise.resolve({
      name: this.bom.metadata?.name || 'Solution',
      description: getAnnotation(this.bom, 'description') || '',
      documentation: getAnnotation(this.bom, 'documentation'),
      diagram: getAnnotation(this.bom, 'files.cloudnativetoolkit.dev/diagram'),
      vpn: false,
      variables: this.bom.spec.variables || [],
      stack: this.bom.spec.stack
    })
  }
}
