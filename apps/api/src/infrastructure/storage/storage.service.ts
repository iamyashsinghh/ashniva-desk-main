import { join, dirname } from 'node:path';
import { createReadStream } from 'node:fs';
import { mkdir, writeFile, unlink, stat } from 'node:fs/promises';
import { Injectable, type OnModuleDestroy, type OnModuleInit, NotFoundException } from '@nestjs/common';
import { CreateBucketCommand, HeadBucketCommand, S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { PinoLogger } from 'nestjs-pino';

import { AppConfigService } from '../../config/app-config.service';
import { QueueShutdownService } from '../queue/queue-shutdown.service';

export interface StoragePutOptions {
  key: string;
  body: Uint8Array | Buffer | string;
  contentType: string;
  contentLength?: number;
}

export interface StorageGetObjectOutput {
  stream: NodeJS.ReadableStream;
  contentType?: string;
  contentLength?: number;
}

/**
 * Storage service providing a unified interface over S3 (MinIO locally or AWS S3)
 * or local filesystem storage, depending on STORAGE_PROVIDER config.
 */
@Injectable()
export class StorageService implements OnModuleInit, OnModuleDestroy {
  public readonly client?: S3Client;
  public readonly bucket?: string;
  public readonly isLocal: boolean;

  constructor(
    private readonly config: AppConfigService,
    private readonly queueShutdown: QueueShutdownService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(StorageService.name);
    const storage = config.storage;
    this.isLocal = storage.provider === 'local';

    if (!this.isLocal) {
      this.bucket = storage.bucket;
      this.client = new S3Client({
        endpoint: storage.endpoint,
        region: storage.region,
        forcePathStyle: storage.forcePathStyle,
        credentials: { 
          accessKeyId: storage.accessKey as string, 
          secretAccessKey: storage.secretKey as string 
        },
      });
    }
  }

  async onModuleInit(): Promise<void> {
    if (this.isLocal) {
      const localPath = this.config.storage.localPath;
      if (localPath) {
        await mkdir(localPath, { recursive: true });
        this.logger.info({ localPath }, 'Verified local storage directory');
      }
      return;
    }

    if (!this.config.storage.autoCreateBucket || !this.client || !this.bucket) {
      return;
    }
    
    try {
      await this.ensureBucketExists();
    } catch (error) {
      // Storage being down must not stop the API from starting; the health check reports it.
      this.logger.warn({ err: error }, 'Could not verify or create the storage bucket');
    }
  }

  async onModuleDestroy(): Promise<void> {
    // Workers first, for the same reason PrismaService waits: a job writing an invoice PDF would
    // otherwise find a destroyed client. See QueueShutdownService.
    await this.queueShutdown.drain();
    if (this.client) {
      // Releases keep-alive sockets so the process (and the test runner) can exit promptly.
      this.client.destroy();
    }
  }

  async checkBucket(): Promise<void> {
    if (this.isLocal || !this.client || !this.bucket) return;
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }

  async ensureBucketExists(): Promise<void> {
    if (this.isLocal || !this.client || !this.bucket) return;
    try {
      await this.checkBucket();
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.info({ bucket: this.bucket }, 'Created storage bucket');
    }
  }

  async putObject(options: StoragePutOptions): Promise<void> {
    if (this.isLocal) {
      const filePath = join(this.config.storage.localPath || './storage-data', options.key);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, options.body);
      return;
    }

    if (!this.client || !this.bucket) throw new Error('S3 Client not initialized');
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: options.key,
        Body: options.body,
        ContentType: options.contentType,
        ContentLength: options.contentLength,
      }),
    );
  }

  async getObject(key: string): Promise<StorageGetObjectOutput> {
    if (this.isLocal) {
      const filePath = join(this.config.storage.localPath || './storage-data', key);
      try {
        const fileStat = await stat(filePath);
        return {
          stream: createReadStream(filePath),
          contentLength: fileStat.size,
        };
      } catch (err: any) {
        if (err.code === 'ENOENT') {
          throw new NotFoundException('File not found in local storage');
        }
        throw err;
      }
    }

    if (!this.client || !this.bucket) throw new Error('S3 Client not initialized');
    const object = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
    if (!object.Body) {
      throw new NotFoundException('File content is missing');
    }
    return {
      stream: object.Body as NodeJS.ReadableStream,
      contentType: object.ContentType,
      contentLength: object.ContentLength,
    };
  }

  async deleteObject(key: string): Promise<void> {
    if (this.isLocal) {
      const filePath = join(this.config.storage.localPath || './storage-data', key);
      try {
        await unlink(filePath);
      } catch (err: any) {
        if (err.code !== 'ENOENT') {
          throw err;
        }
      }
      return;
    }

    if (!this.client || !this.bucket) return;
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }
}
