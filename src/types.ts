export type Source = "cerebro" | "octgn" | "record";

export interface SourceFace {
  code: string;
  landscape: boolean;
  cerebro?: string;
  record?: string;
  octgn?: string;
}

export interface Encoded {
  key: string;
  from: Source;
}

export interface Manifest {
  version: 1;
  base: string;
  faces: Record<string, { en?: Encoded; fr?: Encoded }>;
  assets: Record<string, string>;
}
