import {OutputFile, OutputFileType} from './file.model';
import {omit} from '../util/object-util/object-util';

export interface TileVariable {
  key: string,
  type: string;
  default_value?: string;
  description?: string;
  required?: boolean;
  hidden?: boolean;
  options?: Array<{label: string, value: string}>;
}

export interface TileLicense {
  name: string;
  url: string;
}

export interface TileVersion {
  version: string;
  catalog_id: string;
  repo_url?: string;
  tgz_url: string;
  configuration: TileVariable[];
  entitlement: {
    provider_name: string;
    provider_id: string;
  };
  install: {
    instructions: string;
  };
  licenses: TileLicense[];
  deprecated: boolean;
  long_description: string;
}

export interface TileKind {
  format_kind: string;
  install_kind: string;
  target_kind: string;
  versions: TileVersion[];
}

export interface TileModel {
  label: string;
  name: string;
  offering_icon_url: string;
  tags: string[];
  rating: any;
  short_description: string;
  kinds: TileKind[];
  catalog_id: string;
  hidden: boolean;
  provider: string;
  repo_info: {
    type: string;
  };
}

export class Tile implements TileModel {
  label!: string;
  name!: string;
  // tslint:disable-next-line:variable-name
  offering_icon_url!: string;
  tags!: string[];
  rating: any;
  // tslint:disable-next-line:variable-name
  short_description!: string;
  kinds: TileKind[] = [];
  // tslint:disable-next-line:variable-name
  catalog_id!: string;
  hidden: boolean = false;
  provider: string = 'IBM';
  // tslint:disable-next-line:variable-name
  repo_info!: {
    type: string;
  };

  constructor(model: TileModel) {
    Object.assign(this, model);
  }

  get file(): OutputFile {
    return {
      name: `offering-${this.name}.json`,
      type: OutputFileType.tileConfig,
      contents: () => Promise.resolve(JSON.stringify(omit(this, 'file'))),
    }
  }
}

export function isTileConfig(value: any): value is TileConfig {
  return !!value && !!(value.label) && !!(value.name);
}

export interface TileConfig {
  label: string;
  name: string;
  shortDescription?: string;
}
