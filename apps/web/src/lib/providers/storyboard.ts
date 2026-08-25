export type StoryboardGenerationInput = {
  script: string;
  platform: string;
};

export type StoryboardScene = {
  narration: string;
  visualDescription: string;
  audioDirection: string;
  durationSeconds: number;
};

export type StoryboardGenerationResult = {
  scenes: StoryboardScene[];
  provider: string;
  model: string;
  // True when the provider's raw response was cut off (hit its output
  // token ceiling) and `scenes` is a recovered partial prefix rather than
  // the complete breakdown — M4's long-form case. Callers should still keep
  // the scenes (never throw away completed work) but tell the Owner so they
  // know to regenerate rather than assume the list is final.
  truncated: boolean;
};

export interface StoryboardProvider {
  readonly name: string;
  isConfigured(): boolean;
  generate(input: StoryboardGenerationInput): Promise<StoryboardGenerationResult>;
}
