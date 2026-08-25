import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl as presign } from "@aws-sdk/s3-request-presigner";
import type { PutObjectInput, StorageProvider } from "./storage";

// Works against AWS S3 or Cloudflare R2 (R2 speaks the S3 API) — set
// STORAGE_ENDPOINT for R2, leave it unset for real S3.
export class S3StorageProvider implements StorageProvider {
  isConfigured(): boolean {
    return Boolean(
      process.env.STORAGE_BUCKET &&
        process.env.STORAGE_ACCESS_KEY_ID &&
        process.env.STORAGE_SECRET_ACCESS_KEY,
    );
  }

  private client(): S3Client {
    return new S3Client({
      region: process.env.STORAGE_REGION ?? "auto",
      endpoint: process.env.STORAGE_ENDPOINT,
      credentials: {
        accessKeyId: process.env.STORAGE_ACCESS_KEY_ID!,
        secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY!,
      },
    });
  }

  async putObject(input: PutObjectInput): Promise<{ key: string; sizeBytes: number }> {
    if (!this.isConfigured()) {
      throw new Error("Object storage is not configured.");
    }

    await this.client().send(
      new PutObjectCommand({
        Bucket: process.env.STORAGE_BUCKET!,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
      }),
    );

    return { key: input.key, sizeBytes: input.body.byteLength };
  }

  async getSignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error("Object storage is not configured.");
    }

    return presign(
      this.client(),
      new GetObjectCommand({ Bucket: process.env.STORAGE_BUCKET!, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }

  async getObject(key: string): Promise<Buffer> {
    if (!this.isConfigured()) {
      throw new Error("Object storage is not configured.");
    }

    const result = await this.client().send(
      new GetObjectCommand({ Bucket: process.env.STORAGE_BUCKET!, Key: key }),
    );
    const bytes = await result.Body?.transformToByteArray();
    if (!bytes) {
      throw new Error(`Object storage returned no body for key "${key}".`);
    }

    return Buffer.from(bytes);
  }

  async deleteObject(key: string): Promise<void> {
    if (!this.isConfigured()) {
      throw new Error("Object storage is not configured.");
    }

    await this.client().send(new DeleteObjectCommand({ Bucket: process.env.STORAGE_BUCKET!, Key: key }));
  }
}
