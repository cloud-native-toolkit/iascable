import superagent from 'superagent';
import {loadFile} from '../util/file-util';

export enum OutputFileType {
  terraform = 'terraform',
  tileConfig = 'tile-config',
  documentation = 'documentation',
  dotGraph = 'dot-graph',
  executable = 'executable'
}

export interface OutputFile {
  name: string;
  type?: OutputFileType;
  readonly contents: Promise<string | Buffer>;
}

export class SimpleFile implements OutputFile {
  name: string;
  type?: OutputFileType;
  _contents: string | Buffer

  constructor({name, type, contents}: {name: string, type?: OutputFileType, contents: string | Buffer}) {
    this.name = name
    this.type = type
    this._contents = contents
  }

  get contents(): Promise<string | Buffer> {
    return Promise.resolve(this._contents)
  }
}

export class UrlFile implements OutputFile {
  name: string;
  url: string;
  type?: OutputFileType;
  _alternative: () => Promise<string | Buffer>;

  constructor({name, url, type, alternative = () => Promise.resolve('')}: {name: string, url: string, type?: OutputFileType, alternative?: () => Promise<string | Buffer>}) {
    this.name = name;
    this.url = url;
    this.type = type;
    this._alternative = alternative;
  }

  get contents(): Promise<string | Buffer> {
    return loadFile(this.url).catch(() => this._alternative())
  }
}
