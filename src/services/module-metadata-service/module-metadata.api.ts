import {Module} from '../../models';

export interface ModuleServiceCreateParams {
  repoSlug: string
  version: string
  metadataFile?: string
  strict?: boolean
  publishBranch?: string
}

export interface ModuleServiceVerifyParams {
  metadata: Module
  strict?: boolean
}

export interface ModuleServiceCreateResult {
  metadata: Module
}

export abstract class ModuleMetadataApi {

  abstract create(params: ModuleServiceCreateParams): Promise<ModuleServiceCreateResult>;

}
