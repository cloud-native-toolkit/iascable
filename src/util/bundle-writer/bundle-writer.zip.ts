import {promises} from 'fs';
import JSZip from 'jszip';
import {dirname} from 'path';

import {
  BufferedWriterModifiers,
  BufferOrString,
  BundleWriter,
  BundleWriterType
} from './bundle-writer.api';
import {BundleWriterError} from './bundle-writer.error';

export class BundleWriterZip implements BundleWriter {
  type: BundleWriterType = BundleWriterType.zip;

  _root: JSZip;
  _zip: JSZip;

  constructor(params?: {root: JSZip, current: JSZip}) {
    if (!params) {
      this._root = this._zip = new JSZip()
    } else {
      this._root = params.root
      this._zip = params.current
    }
  }

  file(name: string, contents: BufferOrString | Promise<BufferOrString>, modifiers?: BufferedWriterModifiers): BundleWriter {
    const path = dirname(name)

    const zip = (!path || path === '.') ? this._zip : this._zip.folder(path)
    if (zip === null) {
      throw new BundleWriterError(`Unable to change to folder: ${path}`)
    }

    if (modifiers?.executable) {
      zip.file(name, contents, {unixPermissions: '755', dosPermissions: 34})
    } else {
      zip.file(name, contents)
    }

    return this
  }

  folder(name: string): BundleWriter {
    if (!name || name === '.') {
      return this
    }

    const current: JSZip = this._zip.folder(name) as JSZip

    return new BundleWriterZip({root: this._root, current})
  }

  async generate(file: string): Promise<void> {
    const path: string = dirname(file)
    if (path) {
      await promises.mkdir(path, {recursive: true})
    }

    await this._root
      .generateAsync({type: 'nodebuffer'})
      .then(async (content: Buffer) => {
        return promises.writeFile(file, content)
      })
  }
}
