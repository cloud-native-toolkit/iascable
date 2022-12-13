
export enum BundleWriterType {
  filesystem = 'filesystem',
  zip = 'zip'
}

export interface BufferedWriterModifiers {
  executable: boolean
}

export type BufferOrString = Buffer | string

export abstract class BundleWriter {
  abstract type: BundleWriterType;

  abstract file(name: string, contents: BufferOrString | Promise<BufferOrString>, modifiers?: BufferedWriterModifiers): BundleWriter;

  abstract folder(name: string): BundleWriter;

  abstract generate(file: string, options?: {flatten: boolean}): Promise<void>;
}
