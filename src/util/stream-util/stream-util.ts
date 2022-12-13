import {Readable} from 'stream';

export const fromReadable = async (reader: Readable): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const data: any[] = [];

    reader.on('data', (chunk: any) => data.push(chunk))

    reader.on('error', err => reject(err))

    reader.on('end', () => resolve(Buffer.concat(data)))
  })
}
