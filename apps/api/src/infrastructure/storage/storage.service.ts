import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { CreateBucketCommand, HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { PinoLogger } from 'nestjs-pino';

import { AppConfigService } from '../../config/app-config.service';
import { QueueShutdownService } from '../queue/queue-shutdown.service';

/**
 * S3-compatible object storage (MinIO locally). Phase 1 adds presigned upload/download URLs in
 * the files module; this service owns the client and the bucket.
 */
@Injectable()
export class StorageService implements OnModuleInit, OnModuleDestroy {
  readonly client: S3Client;
  readonly bucket: string;

  constructor(
    private readonly config: AppConfigService,
    private readonly queueShutdown: QueueShutdownService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(StorageService.name);
    const storage = config.storage;
    this.bucket = storage.bucket;
    this.client = new S3Client({
      endpoint: storage.endpoint,
      region: storage.region,
      forcePathStyle: storage.forcePathStyle,
      credentials: { accessKeyId: storage.accessKey, secretAccessKey: storage.secretKey },
    });
  }

  async onModuleInit(): Promise<void> {
    if (!this.config.storage.autoCreateBucket) {
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
    // Releases keep-alive sockets so the process (and the test runner) can exit promptly.
    this.client.destroy();
  }

  async checkBucket(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }

  async ensureBucketExists(): Promise<void> {
    try {
      await this.checkBucket();
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.info({ bucket: this.bucket }, 'Created storage bucket');
    }
  }
}
