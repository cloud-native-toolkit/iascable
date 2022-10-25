import {chmodSync, lstatSync, promises} from 'fs';
import {join} from 'path';
import superagent from 'superagent';

export async function chmodRecursive(root: string, mode: number) {
  chmodSync(root, mode)

  const childDirs: string[] = (await promises.readdir(root))
    .map(value => join(root, value))
    .filter(value => lstatSync(value).isDirectory())

  childDirs.forEach(dir => chmodRecursive(dir, mode))
}

export async function loadFile(path: string): Promise<string> {
  if (/^http.*/.test(path)) {
    return superagent.get(path).then(resp => resp.text)
  }

  return promises.readFile(path.replace(/^file:/, ''))
    .then(buf => buf.toString())
}

