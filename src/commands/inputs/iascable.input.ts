
export interface IascableValidate {
  catalogUrl: string;
  input?: string;
  reference?: string;
}

export interface IascableBuild extends IascableValidate{
  ci: boolean;
  prompt: boolean;
  platform?: string;
  provider?: string;
  tileLabel?: string;
  name: string;
  tileDescription?: string;
  outDir?: string;
}
