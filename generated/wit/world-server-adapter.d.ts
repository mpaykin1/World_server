// AUTO-GENERATED from WIT. DO NOT EDIT.
export type ArtifactRef = { uri: string; sha256: string; mediaType: string };
export type QualityResult = { score: number; status: string; evidenceJson: string };
export type TransformRequest = { input: ArtifactRef; operation: string; optionsJson: string };
export interface QualityAdapter { analyze(input: ArtifactRef): Promise<QualityResult>; }
export interface AssetTransform { transform(request: TransformRequest): Promise<ArtifactRef>; }
