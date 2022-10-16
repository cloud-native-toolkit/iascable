
export interface IascableInput {
  catalogUrls: string[];
  input?: string[];
  reference?: string[];
  platform?: string;
  provider?: string;
  tileLabel?: string;
  name?: string[];
  tileDescription?: string;
  outDir?: string;
}

export interface IascableDocsInput {
  catalogUrls: string[];
  module: string;
  outDir: string;
  flattenOutput: boolean;
}

export interface IascableGenerateInput {
  module?: string;
  moduleVersion: string;
  repoSlug: string;
  metadataFile: string;
  metadataUrl?: string;
  publishBranch: string;
  outDir: string;
  flattenOutput: boolean;
}

export interface IascableCatalogInput {
  moduleMetadataUrl?: string
  catalogInput?: string
  category: string
  outDir: string
}
