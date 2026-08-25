export type PutObjectInput = {
  key: string;
  body: Buffer;
  contentType: string;
};

export interface StorageProvider {
  isConfigured(): boolean;
  putObject(input: PutObjectInput): Promise<{ key: string; sizeBytes: number }>;
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
  getObject(key: string): Promise<Buffer>;
}
