import * as superagent from 'superagent';

export enum OutputFileType {
  terraform = 'terraform',
  tileConfig = 'tile-config',
  documentation = 'documentation',
  dotGraph = 'dot-graph'
}

export interface OutputFile {
  name: string;
  type?: OutputFileType;
  readonly contents: Promise<string | Buffer>;
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
    return superagent
      .get(this.url)
      .then(res => res.text)
      .catch(() => this._alternative())
  }
}
