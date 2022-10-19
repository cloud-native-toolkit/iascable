import {BundleWriter, BundleWriterType} from './bundle-writer.api';
import {BundleWriterNotFound} from './bundle-writer.error';
import {BundleWriterFs} from './bundle-writer.fs';
import {BundleWriterZip} from './bundle-writer.zip';

export const getBundleWriter = (type: BundleWriterType): BundleWriter => {
  if (type === BundleWriterType.filesystem) {
    return new BundleWriterFs()
  }

  if (type === BundleWriterType.zip) {
    return new BundleWriterZip()
  }

  throw new BundleWriterNotFound(type)
}
