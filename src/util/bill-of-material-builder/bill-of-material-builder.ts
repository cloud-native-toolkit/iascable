import {default as jsYaml} from 'js-yaml';
import {promises} from 'fs';
import {resolve, join} from 'path';

import {
  BillOfMaterial, billOfMaterialFromYaml, BillOfMaterialModel,
  BillOfMaterialModule,
  BillOfMaterialVariable,
  Module
} from '../../models';
import {SolutionModel} from '../../models/solution.model';
import {
  BillOfMaterialModuleParsingError,
  BillOfMaterialVariableParsingError,
  ModuleNotFound
} from '../../errors';
import {isDefinedAndNotNull, isUndefined} from '../object-util';
import {of as arrayOf} from '../array-util/array-util';
import {loadFile} from '../file-util';
import {Catalog} from '../../model-impls';

export function buildBomVariables(bomVariableYaml: string): BillOfMaterialVariable[] {
  if (!bomVariableYaml) {
    return [];
  }

  let content: any;
  try {
    content = jsYaml.load(bomVariableYaml);
  } catch (err) {
    throw new BillOfMaterialVariableParsingError(bomVariableYaml);
  }

  if (!Array.isArray(content) && isDefinedAndNotNull(content?.variables)) {
    return content.variables;
  } else if (Array.isArray(content)) {
    return content;
  } else {
    throw new BillOfMaterialVariableParsingError(bomVariableYaml);
  }
}

export function buildBomModule(catalog: Catalog, moduleId: string, moduleConfigYaml: string): BillOfMaterialModule {
  const module: Module | undefined = catalog.lookupModule({name: moduleId, id: moduleId});

  if (!module) {
    throw new ModuleNotFound(moduleId);
  }

  return Object.assign(
    {name: module.name},
      parseModuleConfigYaml(moduleConfigYaml),
    )
}

function parseModuleConfigYaml(moduleConfigYaml: string): Omit<BillOfMaterialModule, 'name'> {
  if (!moduleConfigYaml) {
    return {};
  }

  try {
    const content: any = jsYaml.load(moduleConfigYaml);

    delete content.name;

    return content;
  } catch (err) {
    throw new BillOfMaterialModuleParsingError(moduleConfigYaml);
  }
}

export async function loadReferenceBom(name: string, newName?: string): Promise<BillOfMaterialModel> {
  const boms: BillOfMaterialModel[] = await loadReferenceBoms();

  const nameMatcher = new RegExp(name + '.*', 'ig');

  return arrayOf(boms)
    .filter(bom => nameMatcher.test(bom.metadata?.name || ''))
    .first()
    .map(bom => {
      return Object.assign(
        {},
        bom,
        {
          metadata: Object.assign(
            {},
            bom.metadata,
            {name: newName || bom.metadata?.name}
          )
        }
      );
    })
    .orElseThrow(new Error('Unable to find reference BOM: ' + name));
}

export async function loadReferenceBoms(): Promise<BillOfMaterialModel[]> {

  const appDir: string = resolve(__dirname);

  const basePath: string = join(appDir, '../../../../ref-arch');
  const files: string[] = await promises.readdir(basePath);

  return Promise.all(
    files
      .map(async filename => {
        return loadBillOfMaterialFromFile(join(basePath, filename));
      })
      .filter(b => !isUndefined(b)) as any
  );
}

export async function loadBillOfMaterialFromFile(input?: string, name?: string): Promise<BillOfMaterialModel | SolutionModel | undefined> {
  return input
    ? loadFile(input).then(text => billOfMaterialFromYaml(text, name))
    : new BillOfMaterial(name);
}
