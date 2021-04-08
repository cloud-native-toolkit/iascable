import {ModuleVariable} from './module.model';

export interface StagePrinter {
  asString(stages: {[name: string]: {name: string}}): string;
}

export interface IBaseVariable {
  name: string;
  description?: string;
  type?: string;
  alias?: string;
  defaultValue?: string;
  scope?: 'module' | 'global' | 'ignore';
  options?: Array<{label: string, value: string}>;
}

export interface BaseVariable extends IBaseVariable, StagePrinter {
}

export interface IModuleVariable extends IBaseVariable {
  moduleRef: {stageName: string};
  moduleOutputName: string;
}

export class ModuleRefVariable implements IModuleVariable, BaseVariable {
  name: string;
  description?: string;
  type?: string;
  scope?: 'global' | 'module' | 'ignore' = 'module';

  moduleRef: {stageName: string};
  moduleOutputName: string;

  constructor(values: IModuleVariable) {
    this.name = values.name;
    this.description = values.description;
    this.type = values.type;
    this.scope = values.scope;
    this.moduleRef = values.moduleRef;
    this.moduleOutputName = values.moduleOutputName;
  }

  asString(stages: {[name: string]: {name: string}}): string {
    const module: {name: string} = stages[this.moduleRef.stageName];

    return `${this.name} = module.${module.name}.${this.moduleOutputName}\n`;
  }
}

export function isModuleRefVariable(value: IBaseVariable): value is ModuleRefVariable {
  return (!!value) && !!(value as ModuleRefVariable).moduleRef;
}

export interface IGlobalRefVariable extends IBaseVariable {
  variableName: string;
}

export class GlobalRefVariable implements IGlobalRefVariable, BaseVariable {
  name: string;
  description?: string;
  type?: string;

  variableName: string;

  constructor(values: IGlobalRefVariable) {
    this.name = values.name;
    this.description = values.description;
    this.type = values.type;
    this.variableName = values.variableName;
  }

  asString(): string {
    if (this.type === 'bool') {
      return `${this.name} = var.${this.variableName} == "true"\n`;
    } else if (this.type === 'list(string)') {
      return `${this.name} = split(",", var.${this.variableName})\n`;
    } else if (this.type?.match(/list\(object/)) {
      return `${this.name} = jsondecode(var.${this.variableName})\n`;
    }

    return `${this.name} = var.${this.variableName}\n`;
  }
}

export function isGlobalRefVariable(value: IBaseVariable): value is GlobalRefVariable {
  return (!!value) && !!(value as GlobalRefVariable).variableName;
}

export interface IPlaceholderVariable extends IBaseVariable {
  variable: ModuleVariable;
}

export class PlaceholderVariable implements IPlaceholderVariable, BaseVariable {
  name: string;
  description?: string;
  type?: string;
  scope?: 'global' | 'module' | 'ignore';
  alias?: string;
  defaultValue?: string;

  variable: ModuleVariable;

  constructor(props: IPlaceholderVariable) {
    this.name = props.name;
    this.description = props.description;
    this.type = props.type;
    this.scope = props.scope;
    this.alias = props.alias;
    this.defaultValue = props.defaultValue;
    this.variable = props.variable;
  }

  asString(): string {
    return '';
  }
}

export function isPlaceholderVariable(value: IBaseVariable): value is PlaceholderVariable {
  return (!!value) && !!(value as PlaceholderVariable).variable;
}

export function fromBaseVariable(variable: IBaseVariable): BaseVariable {
  if (isGlobalRefVariable(variable)) {
    return new GlobalRefVariable(variable);
  } else if (isModuleRefVariable(variable)) {
    return new ModuleRefVariable(variable);
  } else if (isPlaceholderVariable(variable)) {
    return new PlaceholderVariable(variable);
  } else {
    throw new Error('Unknown variable type: ' + JSON.stringify(variable));
  }
}

export interface TerraformVariable extends IBaseVariable {
  asString(): string;
}

export class TerraformVariableImpl implements TerraformVariable {
  name: string = '';
  private _type: string = '';
  private _description: string = '';
  private _defaultValue: any;

  constructor(values: {name: string, defaultValue?: string, type?: string, description?: string}) {
    Object.assign(this, values);
  }

  get type() {
    return this._type || 'string';
  }
  set type(type: string) {
    this._type = type;
  }

  get defaultValue() {
    return this._defaultValue;
  }
  set defaultValue(value: string) {
    this._defaultValue = value;
  }

  get description() {
    return this._description || `the value of ${this.name}`;
  }
  set description(description: string) {
    this._description = description;
  }

  asString(): string {
    return `variable "${this.name}" {
  type = string
  description = "${this.description}"${this.defaultValueProp()}
}
`;
  }

  defaultValueProp(): string {
    if (this._defaultValue === undefined || this._defaultValue === null) {
      return '';
    }

    const typeFormatter = getTypeFormatter(this.type);

    const value = typeFormatter(this.defaultValue);

    return `
  default = ${value}`;
  }
}

const getTypeFormatter = (type: string) => {
  const lookupType = type.match(/^list\(/) ? 'list' : type.match(/^object\(/) ? 'object' : type;

  const formatter = typeFormatters[lookupType] || defaultFormatter;

  return formatter;
}

const defaultFormatter: (value: string) => string = (value: string) => `"${value}"`;

const typeFormatters: {[type: string]: (value: string) => string} = {
  'bool': defaultFormatter,
  'number': (value: string) => value,
  // tslint:disable-next-line:triple-equals
  'list': (value: any) => value == '' ? '"[]"' : `"${value}"`,
  // tslint:disable-next-line:triple-equals
  'object': (value: any) => value == '' ? '"{}"' : `"${value}"`,
  'string': defaultFormatter,
}
