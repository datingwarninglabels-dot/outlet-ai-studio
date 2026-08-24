export type StoryboardGenerationInput = {
  script: string;
  platform: string;
};

export type StoryboardScene = {
  narration: string;
  visualDescription: string;
  durationSeconds: number;
};

export type StoryboardGenerationResult = {
  scenes: StoryboardScene[];
  provider: string;
  model: string;
};

export interface StoryboardProvider {
  readonly name: string;
  isConfigured(): boolean;
  generate(input: StoryboardGenerationInput): Promise<StoryboardGenerationResult>;
}
