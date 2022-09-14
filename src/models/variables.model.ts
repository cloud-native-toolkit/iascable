import {BillOfMaterialProviderVariable} from './bill-of-material.model';
import {ModuleVariable} from './module.model';
import {ArrayUtil, of as arrayOf} from '../util/array-util';
import {isDefined} from '../util/object-util';
import {ModuleNotFound} from '../errors';
import {StageNotFound} from '../errors/stage-not-found.error';

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
  stageName?: string;
  important?: boolean;
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
    this.scope = 'global';
    this.moduleRef = values.moduleRef;
    this.moduleOutputName = values.moduleOutputName;
    this.mapper = values.mapper || 'equality';
  }

  asString(stages: {[name: string]: {name: string}}): string {
    return `${this.name} = ${this.valueString(stages)}`;
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
      const stageName = this.moduleRef.stageName
      const module: { name: string } = stages[stageName] || stages[stageName.replace('-', '_')];

      if (!module) {
        throw new StageNotFound(stageName, Object.keys(stages))
      }

      const moduleRefString = this.moduleRefString(module);

      if (this.mapper === 'collect') {
        return '[' + moduleRefString + ']';
      }

      return moduleRefString;
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
    if (this.type?.match(/^list\(/)) {
      return `${this.name} = var.${this.variableName} == null ? null : jsondecode(var.${this.variableName})`;
    }

    return `${this.name} = var.${this.variableName}`;
  }
}

export function isGlobalRefVariable(value: IBaseVariable): value is GlobalRefVariable {
  return (!!value) && !!(value as GlobalRefVariable).variableName;
}

export interface IPlaceholderVariable extends IBaseVariable {
  variable: ModuleVariable;
  variableName?: string;
}

export class PlaceholderVariable implements IPlaceholderVariable, BaseVariable {
  name: string;
  description?: string;
  type?: string;
  scope?: 'global' | 'module' | 'ignore';
  alias?: string;
  defaultValue?: string;

  variable: ModuleVariable;
  stageName: string;
  variableName?: string;
  important?: boolean;

  constructor(props: Partial<IBaseVariable> & {variable: ModuleVariable} & {stageName: string} & {variableName?: string}) {
    this.name = props.name || props.variable.name;
    this.description = props.description || props.variable.description;
    this.type = props.type || props.variable.type || 'string';
    this.scope = props.scope || props.variable.scope || 'module';
    this.alias = props.alias || props.variable.alias;
    this.defaultValue = isDefined(props.defaultValue) ? props.defaultValue : props.variable.defaultValue;
    this.variable = props.variable;
    this.stageName = props.stageName;
    this.important = props.important || props.variable.important;
    this.variableName = props.variableName || buildVariableName(this);
  }

  asString(): string {
    if (!this.variableName) {
      return ''
    }

    if (this.type?.match(/^list\(/)) {
      return `${this.name} = var.${this.variableName} == null ? null : jsondecode(var.${this.variableName})`;
    }

    return `${this.name} = var.${this.variableName}`;
  }
}

const buildVariableName = (props: IPlaceholderVariable): string => {
  if (props.scope === 'global') {
    return props.alias || props.name as string
  }

  return `${props.stageName}_${props.alias || props.name}`
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

export interface TerraformProvider {
  name: string;
  alias?: string;
  source?: string;
  variables: BaseVariable[];
  stages: {[name: string]: {name: string}}

  asString(): string;
}

export function mergeVariables(variables: BillOfMaterialProviderVariable[], bomVariables: BillOfMaterialProviderVariable[] = []): BillOfMaterialProviderVariable[] {
  return variables.map(v => {
    return arrayOf(bomVariables)
      .filter(bomV => bomV.name === v.name)
      .first()
      .map(bomV => Object.assign({}, v, bomV))
      .orElse(v);
  })
}

export class TerraformProviderImpl implements TerraformProvider {
  name: string = '';
  alias?: string;
  source?: string;
  _variables: BaseVariable[] = [];
  stages: {[name: string]: {name: string}} = {}

  constructor({name, alias, source, variables}: {name: string, alias?: string, source?: string, variables?: BaseVariable[]}, stages: {[name: string]: {name: string}}) {
    Object.assign(this as any, {name, alias, source, variables}, {stages});
  }

  get variables(): BaseVariable[] {
    return this._variables || [];
  }
  set variables(variables: BaseVariable[]) {
    this._variables = variables;
  }

  private aliasString(indent: string = '  '): string {
    if (!this.alias) {
      return '';
    }

    return `${indent}alias = "${this.alias}"`
  }

  private variableString(indent: string = '  '): string {
    if (this.variables.length === 0) {
      return '';
    }

    return this._variables
      .reduce((previousValue: Buffer, variable: BaseVariable) => {

        const value: string = `${indent}${variable.asString(this.stages)}`

        return Buffer.concat([
          previousValue,
          Buffer.from('\n'),
          Buffer.from(value)
        ])
      }, Buffer.from(''))
      .toString();
  }

  asString(): string {
    return `provider "${this.name}" {
${this.aliasString('  ')}
${this.variableString('  ')}
}`
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
  private _important?: boolean;

  constructor(values: {name: string, defaultValue?: string, type?: string, description?: string, required?: boolean, important?: boolean}) {
    Object.assign(this as TerraformVariable, values);
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

  get important(): boolean | undefined {
    return this._important
  }
  set important(important: boolean | undefined) {
    this._important = important
  }

  asString(): string {
    return `variable "${this.name}" {
  type = ${this.typeOutput()}
  description = "${this.description}"${this.defaultValueProp()}
}
`;
  }

  defaultValueProp(): string {
    if (this._defaultValue === undefined || this.required) {
      return '';
    }

    const value = this.getDefaultValue();

    return `
  default = ${value}`;
  }

  getDefaultValue(): string {
    const typeFormatter: Formatter = getTypeFormatter(this.type);

    const {value} = typeFormatter(this.defaultValue);

    if (this.name === 'xxxxx') {
      console.log('Variable: ' + this.name, {defaultValue: this.defaultValue, formattedValue: value, typeFormatter: typeFormatter.toString(), type: this.type})
    }

    return value;
  }

  typeOutput(): string {
    const typeFormatter: Formatter = getTypeFormatter(this.type);

    const type = typeFormatter(this.defaultValue || '').type;

    if (this.name === 'xxxxx') {
      console.log('Variable: ' + this.name, {type: type, originalType: this.type, typeFormatter: typeFormatter.toString()})
    }

    return type;
  }
}

export class TerraformTfvars {
  name: string;
  description: string;
  value: string;

  constructor({name, description, value}: {name: string, description: string, value: string}) {
    this.name = name;
    this.description = description;
    this.value = value;
  }

  asString(): string {
    return `## ${this.name}: ${this.description}
#${this.name}="${this.value}"

`
  }
}

type Formatter = (value: string) => {type: string, value: string};

const getTypeFormatter = (type: string): Formatter => {
  const lookupType = type.match(/^list\(object\(/) ? 'object-list' : type.match(/^object\(/) ? 'object' : type.match(/^list\(/) ? 'list' : type;

  const formatter = typeFormatters[lookupType] || defaultFormatter;

  return formatter;
}

const defaultFormatter: Formatter = (value: string) => {
  if (value === 'null' || value === null) {
    return {type: 'string', value: 'null'};
  }

  return {type: 'string', value: `"${value}"`};
}

const buildTypeFormatter = (name: string, fn: Formatter): Formatter => {
  fn.toString = () => `typeFormatter: ${name}`

  return fn;
}

const typeFormatters: {[type: string]: Formatter} = {
  'bool': buildTypeFormatter('bool', (value: string) => ({type: 'bool', value})),
  'number': buildTypeFormatter('number', (value: string) => ({type: 'number', value})),
  'list': buildTypeFormatter('list', (value: any) => {
    if (value === 'null' || value === null) {
      value = '';
    }

    if (typeof value === 'string') {
      try {
        value = JSON.parse(value)
      } catch (error) {
        value = [];
      }
    }

    // tslint:disable-next-line:triple-equals
    return {type: 'string', value: value == '' ? '"[]"' : `"${JSON.stringify(value).replace(/"/g, '\\"')}"`};
  }),
  'object': buildTypeFormatter('object', (value: any) => {
    if (value === 'null' || value === null) {
      return {type: 'string', value: 'null'};
    }

    if (typeof value === 'string') {
      try {
        value = JSON.parse(value)
      } catch (error) {
        value = null
      }
    }

    // tslint:disable-next-line:triple-equals
    return {type: 'string', value: value === null ? 'null' : (value == '' ? '"{}"' : `"${JSON.stringify(value).replace(/"/g, '\\"')}"`)}
  }),
  'object-list': buildTypeFormatter('object-list', (value: any) => {
    if (value === 'null' || value === null) {
      return {type: 'string', value: 'null'};
    }

    if (typeof value === 'string') {
      try {
        value = JSON.parse(value)
      } catch (error) {
        // ignore error
      }
    }

    // tslint:disable-next-line:triple-equals
    return {type: 'string', value: value == '' ? '"[]"' : `"${JSON.stringify(value).replace(/"/g, '\\"')}"`}
  }),
  'string': buildTypeFormatter('string', defaultFormatter),
}
