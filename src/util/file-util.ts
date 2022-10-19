import {chmodSync, lstatSync, promises} from 'fs';
import {join} from 'path';
import superagent from 'superagent';
// @ts-ignore
import MemoryStream from 'memory-stream';

import {isDefined} from './object-util';

export async function chmodRecursive(root: string, mode: number) {
  chmodSync(root, mode)

  const childDirs: string[] = (await promises.readdir(root))
    .map(value => join(root, value))
    .filter(value => lstatSync(value).isDirectory())

  childDirs.forEach(dir => chmodRecursive(dir, mode))
}

export async function loadFile(path: string): Promise<string> {
  if (/^http.*/.test(path)) {
    return new Promise((resolve, reject) => {
      const ws = new MemoryStream()

      try {
        ws.on('finish', () => {
          resolve(ws.toString())
        })

        superagent
          .get(path)
          .pipe(ws)
          .on('error', (e: Error) => {
            reject(e)
          })
      } finally {
        try { ws.close() } catch (err) {
          // ignore
        }
      }
    })
  }

  return promises.readFile(path.replace(/^file:/, ''))
    .then(buf => buf.toString())
}

