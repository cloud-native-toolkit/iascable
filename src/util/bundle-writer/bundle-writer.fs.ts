import {promises} from 'fs';
import {dirname, basename, join} from 'path';

import {
  BufferedWriterModifiers,
  BufferOrString,
  BundleWriter,
  BundleWriterType
} from './bundle-writer.api';

interface BundleWriterFile {
  path?: string
  name: string
  contents: BufferOrString | Promise<BufferOrString>
  modifiers?: BufferedWriterModifiers
}

export class BundleWriterFs implements BundleWriter {
  readonly type: BundleWriterType = BundleWriterType.filesystem;
  _files: BundleWriterFile[] = [];

  file(name: string, contents: BufferOrString | Promise<BufferOrString>, modifiers?: BufferedWriterModifiers): BundleWriter {
    const path = dirname(name)
    const filename = basename(name)

    if (path && path !== '.') {
      this._files.push({name: filename, contents, path, modifiers})
    } else {
      this._files.push({name, contents, modifiers})
    }

    return this;
  }

  folder(name: string): BundleWriter {
    if (!name || name === '.') {
      return this
    }

    return new BundleWriterFolder(this, name)
  }

  async generate(rootPath: string): Promise<void> {

    for (let i = 0; i < this._files.length; i++) {
      const file = this._files[i]

      const filepath = getFilePath(rootPath, file.path)
      if (filepath) {
        await promises.mkdir(filepath, {recursive: true})
      }

      const filename = filepath ? join(filepath, file.name) : file.name
      if (file.modifiers?.executable) {
        await promises.writeFile(filename, await file.contents, {mode: 0o755})
      } else {
        await promises.writeFile(filename, await file.contents)
      }
    }
  }
}

const getFilePath = (path?: string, filepath?: string): string | undefined => {
  if (path && filepath) {
    return join(path, filepath)
  }

  if (path) {
    return path
  }

  if (filepath) {
    return filepath
  }
}

class BundleWriterFolder implements BundleWriter {
  readonly type: BundleWriterType = BundleWriterType.filesystem;

  constructor(private writer: BundleWriterFs, private path: string) {
  }

  file(name: string, contents: Buffer | string, modifiers?: BufferedWriterModifiers): BundleWriter {
    const path = dirname(name)
    const filename = basename(name)

    if (path && path !== '.') {
      this.writer._files.push({name: filename, contents, path: join(this.path, path), modifiers})
    } else {
      this.writer._files.push({name, contents, path: this.path, modifiers})
    }

    return this;
  }

  folder(name: string): BundleWriter {
    if (!name || name === '.') {
      return this
    }

    return new BundleWriterFolder(this.writer, join(this.path, name))
  }

  async generate(file: string): Promise<void> {
    return this.writer.generate(file)
  }
}
