import {BundleWriterType} from './bundle-writer.api';

export class BundleWriterError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class BundleWriterNotFound extends Error {
  constructor(public readonly type: BundleWriterType) {
    super(`Unable to find bundle writer for type: ${type}`);
  }
}
