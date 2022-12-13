import {ModuleMetadataApi} from './module-metadata.api';
import {ModuleMetadataService} from './module-metadata-service';

export default [
  {bind: ModuleMetadataApi, to: ModuleMetadataService}
]
