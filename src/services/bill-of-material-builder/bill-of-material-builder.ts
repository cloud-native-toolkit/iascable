import {default as jsYaml} from 'js-yaml';
import {BillOfMaterialModule, BillOfMaterialVariable, Catalog, Module} from '../../models';
import {
  BillOfMaterialModuleParsingError,
  BillOfMaterialVariableParsingError,
  ModuleNotFound
} from '../../errors';
import {isDefinedAndNotNull} from '../../util/object-util';

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
