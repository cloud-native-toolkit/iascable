import * as superagent from 'superagent';

export enum OutputFileType {
  terraform = 'terraform',
  tileConfig = 'tile-config',
  documentation = 'documentation'
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

  constructor({name, url, type}: {name: string, url: string, type?: OutputFileType}) {
    this.name = name;
    this.url = url;
    this.type = type;
  }

  get contents(): Promise<string | Buffer> {
    return new Promise<string>(async (resolve) => {
      const req: superagent.Response = await superagent.get(this.url);

      resolve(req.text);
    });
  }
}
