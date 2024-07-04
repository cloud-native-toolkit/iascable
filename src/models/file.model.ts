import superagent from 'superagent';
import {loadFile} from '../util/file-util/file-util';

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
  contents(options?: {flatten?: boolean, path: string}): Promise<string | Buffer>;
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

  contents(): Promise<string | Buffer> {
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

  contents(): Promise<string | Buffer> {
    return loadFile(this.url).catch(() => this._alternative())
  }
}

export class GitIgnoreFile implements OutputFile {
  name: string = '.gitignore';
  type: OutputFileType = OutputFileType.documentation;

  contents(options?: { flatten?: boolean }): Promise<string | Buffer> {
    return Promise.resolve(`terraform.tfstate
terraform.tfstate.backup
credentials.yaml
credentials.auto.tfvars
.tmp/
.terraform/
`);
  }
}

export class DockerIgnoreFile implements OutputFile {
  name: string = '.dockerignore';
  type: OutputFileType = OutputFileType.documentation;

  private gitIgnore: OutputFile;

  constructor() {
    this.gitIgnore = new GitIgnoreFile();
  }

  contents(options?: { flatten?: boolean }): Promise<string | Buffer> {
    return this.gitIgnore.contents()
      .then(contents => contents + '\n\nlaunch.sh')
  }
}
