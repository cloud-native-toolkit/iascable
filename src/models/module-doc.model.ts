import {OutputFile, OutputFileType} from './file.model';

export class ModuleDoc implements OutputFile {
  name: string
  moduleName: string;
  type: OutputFileType
  _contents: string

  constructor({name = 'README.md', contents, moduleName}: {name?: string, contents: string, moduleName: string}) {
    this.name = name
    this.moduleName = moduleName
    this.type = OutputFileType.documentation
    this._contents = contents
  }

  get contents(): Promise<string | Buffer> {
    return Promise.resolve(this._contents)
  }
}
