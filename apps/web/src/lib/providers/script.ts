export type ScriptGenerationInput = {
  idea: string;
  platform: string;
  mode: "quick" | "guided" | "studio";
};

export type ScriptGenerationResult = {
  content: string;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
};

export interface ScriptProvider {
  readonly name: string;
  isConfigured(): boolean;
  generate(input: ScriptGenerationInput): Promise<ScriptGenerationResult>;
}
