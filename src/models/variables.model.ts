import {ModuleVariable} from './module.model';
import {ArrayUtil, of as arrayOf} from '../util/array-util';

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
  required?: boolean;
}

export interface BaseVariable extends IBaseVariable, StagePrinter {
}

export interface IModuleVariable extends IBaseVariable {
  moduleRef: {stageName: string} | {stageName: string}[];
  moduleOutputName: string;
  mapper?: 'equality' | 'collect';
}

export class ModuleRefVariable implements IModuleVariable, BaseVariable {
  name: string;
  description?: string;
  type?: string;
  scope?: 'global' | 'module' | 'ignore' = 'module';

  moduleRef: {stageName: string} | {stageName: string}[];
  moduleOutputName: string;
  mapper?: 'equality' | 'collect' = 'equality';

  constructor(values: IModuleVariable) {
    this.name = values.name;
    this.description = values.description;
    this.type = values.type;
    this.scope = values.scope;
    this.moduleRef = values.moduleRef;
    this.moduleOutputName = values.moduleOutputName;
    this.mapper = values.mapper || 'equality';
  }

  asString(stages: {[name: string]: {name: string}}): string {
    return `${this.name} = ${this.valueString(stages)}\n`;
  }

  valueString(stages: {[name: string]: {name: string}}): string {
    if (Array.isArray(this.moduleRef)) {
      const modules: ArrayUtil<{ name: string }> = arrayOf(this.moduleRef)
        .map(moduleRef => stages[moduleRef.stageName]);

      if (this.mapper === 'collect') {
        const result = modules.map(this.moduleRefString.bind(this));

        return '[' + result.join(',') + ']';
      } else {
        return this.moduleRefString(modules.first().get());
      }
    } else {
      const module: { name: string } = stages[this.moduleRef.stageName];

      return this.moduleRefString(module);
    }
  }

  moduleRefString(module: {name: string}): string {
    return `module.${module.name}.${this.moduleOutputName}`;
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
    if (this.type === 'list(string)') {
      return `${this.name} = tolist(setsubtract(split(",", var.${this.variableName}), [""]))\n`;
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
  private _required?: boolean;

  constructor(values: {name: string, defaultValue?: string, type?: string, description?: string, required?: boolean}) {
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

  get required(): boolean | undefined {
    return this._required;
  }
  set required(required: boolean | undefined) {
    this._required = required;
  }

  asString(): string {
    return `variable "${this.name}" {
  type = ${this.typeOutput()}
  description = "${this.description}"${this.defaultValueProp()}
}
`;
  }

  defaultValueProp(): string {
    if (this._defaultValue === undefined || this._defaultValue === null || this.required) {
      return '';
    }

    const value = this.getDefaultValue();

    return `
  default = ${value}`;
  }

  getDefaultValue(): string {
    const typeFormatter: Formatter = getTypeFormatter(this.type);

    const {value} = typeFormatter(this.defaultValue);

    return value;
  }

  typeOutput(): string {
    const typeFormatter: Formatter = getTypeFormatter(this.type);

    return typeFormatter(this.defaultValue).type;
  }
}

export class TerraformTfvars {
  name: string;
  value: string;

  constructor({name, value}: {name: string, value: string}) {
    this.name = name;
    this.value = value;
  }

  asString(): string {
    return `${this.name} = "${this.value}"`
  }
}

type Formatter = (value: string) => {type: string, value: string};

const getTypeFormatter = (type: string): Formatter => {
  const lookupType = type.match(/^list\(/) ? 'list' : type.match(/^object\(/) ? 'object' : type;

  const formatter = typeFormatters[lookupType] || defaultFormatter;

  return formatter;
}

const defaultFormatter: Formatter = (value: string) => ({type: 'string', value: `"${value}"`});

const typeFormatters: {[type: string]: Formatter} = {
  'bool': (value: string) => ({type: 'bool', value}),
  'number': (value: string) => ({type: 'number', value}),
  // tslint:disable-next-line:triple-equals
  'list': (value: any) => ({type: 'string', value: value == '' ? '""' : `"${value}"`}),
  // tslint:disable-next-line:triple-equals
  'object': (value: any) => ({type: 'string', value: value == '' ? '"{}"' : `"${value}"`}),
  'string': defaultFormatter,
}
