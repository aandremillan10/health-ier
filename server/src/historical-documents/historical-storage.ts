import { Injectable } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { historicalFileLimit } from './file-validation';

@Injectable()
export class HistoricalStorage {
  private client: S3Client | undefined;
  private settings(): { client: S3Client; bucket: string } {
    const endpoint = process.env.HISTORICAL_S3_ENDPOINT;
    const bucket = process.env.HISTORICAL_S3_BUCKET;
    const accessKeyId = process.env.HISTORICAL_S3_ACCESS_KEY;
    const secretAccessKey = process.env.HISTORICAL_S3_SECRET_KEY;
    if (!endpoint || !bucket || !accessKeyId || !secretAccessKey)
      throw new Error('Attachment storage unavailable');
    const url = new URL(endpoint);
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error('Invalid storage origin');
    this.client ??= new S3Client({
      endpoint,
      region: process.env.HISTORICAL_S3_REGION ?? 'us-east-1',
      forcePathStyle: process.env.HISTORICAL_S3_FORCE_PATH_STYLE !== 'false',
      credentials: { accessKeyId, secretAccessKey },
      maxAttempts: 2,
      requestHandler: { requestTimeout: 15000, connectionTimeout: 5000 },
    });
    return { client: this.client, bucket };
  }
  async put(
    key: string,
    bytes: Buffer,
    mimeType: string,
    sha256: string,
  ): Promise<void> {
    const { client, bucket } = this.settings();
    try {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: bytes,
          ContentType: mimeType,
          ContentLength: bytes.length,
          ChecksumSHA256: Buffer.from(sha256, 'hex').toString('base64'),
          IfNoneMatch: '*',
        }),
      );
    } catch (error: unknown) {
      if (!(
        typeof error === 'object' &&
        error !== null &&
        'name' in error &&
        error.name === 'PreconditionFailed'
      ))
        throw error;
      const existing = await this.get(key);
      if (!existing.equals(bytes))
        throw new Error('Immutable file identity conflict');
    }
  }
  async get(key: string): Promise<Buffer> {
    const { client, bucket } = this.settings();
    const response = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    if (
      !response.Body ||
      !response.ContentLength ||
      response.ContentLength > historicalFileLimit
    )
      throw new Error('Invalid stored file size');
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      size += chunk.length;
      if (size > historicalFileLimit)
        throw new Error('Stored file exceeds limit');
      chunks.push(chunk);
    }
    if (size !== response.ContentLength)
      throw new Error('Incomplete stored file');
    return Buffer.concat(chunks);
  }
  async remove(key: string): Promise<void> {
    const { client, bucket } = this.settings();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }
}
