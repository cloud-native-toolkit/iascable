
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
