import {chmodSync, lstatSync, promises} from 'fs';
import {join} from 'path';
import superagent from 'superagent';
import {PassThrough} from 'stream';
import {fromReadable} from '../stream-util';

export async function chmodRecursive(root: string, mode: number) {
  chmodSync(root, mode)

  const childDirs: string[] = (await promises.readdir(root))
    .map(value => join(root, value))
    .filter(value => lstatSync(value).isDirectory())

  childDirs.forEach(dir => chmodRecursive(dir, mode))
}

export async function loadFile(path: string): Promise<string | Buffer> {
  if (path.startsWith('http')) {
    const stream = new PassThrough()

    superagent.get(path).pipe(stream)

    return fromReadable(stream)
  } else if (path.startsWith('data:')) {
    return Buffer.from(path.split(",")[1], 'base64')
  }

  return promises.readFile(path.replace(/^file:/, ''))
}

