export type TTSGenerationInput = {
  text: string;
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
