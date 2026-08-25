export type TTSGenerationInput = {
  text: string;
  /** Overrides the provider's own default voice — Section 17's Brand Kit
   * defaultVoiceId / a project's voiceIdOverride, when set. */
  voiceId?: string;
};

export type TTSGenerationResult = {
  audio: Buffer;
  contentType: string;
  provider: string;
  model: string;
  characterCount: number;
};

export interface TTSProvider {
  readonly name: string;
  isConfigured(): boolean;
  generate(input: TTSGenerationInput): Promise<TTSGenerationResult>;
}
