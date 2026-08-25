import { S3StorageProvider } from "./s3-storage-provider";
import type { StorageProvider } from "./storage";

export const storageProvider: StorageProvider = new S3StorageProvider();
