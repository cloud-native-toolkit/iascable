
export class BillOfMaterialParsingError extends Error {
  constructor(bomYaml: string) {
    super('Error parsing BOM yaml: \n' + bomYaml);
  }
}

export class BillOfMaterialModuleParsingError extends Error {
  constructor(moduleConfigYaml: string) {
    super('Error parsing BOM module config yaml: \n' + moduleConfigYaml);
  }
}

export class BillOfMaterialVariableParsingError extends Error {
  constructor(bomVariableYaml: string) {
    super('Error parsing BOM variable yaml: \n' + bomVariableYaml);
  }
}
