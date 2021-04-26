
export interface IascableInput {
  catalogUrl: string;
  input?: string;
  reference?: string;
  ci: boolean;
  prompt: boolean;
  platform?: string;
  provider?: string;
  tileLabel?: string;
  name: string;
  tileDescription?: string;
  outDir?: string;
}
