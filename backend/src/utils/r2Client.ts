import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT || 'https://c4bc58b1f951e550abd71d855068b8a2.r2.cloudflarestorage.com',
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
  forcePathStyle: false,
});

const BUCKET = process.env.R2_BUCKET || 'imageanimap';
const PUBLIC_URL = process.env.R2_PUBLIC_URL || 'https://cdn.icoser.club';

export const R2_PUBLIC_URL = PUBLIC_URL;

export async function uploadFileToR2(key: string, filePath: string, contentType = 'image/webp'): Promise<string> {
  const body = fs.readFileSync(filePath);
  await r2.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
  }));
  return `${PUBLIC_URL}/${key}`;
}

export async function uploadBufferToR2(key: string, buffer: Buffer, contentType = 'image/webp'): Promise<string> {
  await r2.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
  return `${PUBLIC_URL}/${key}`;
}

export function getR2Key(filename: string): string {
  return path.basename(filename);
}

export async function existsInR2(key: string): Promise<boolean> {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch (err: any) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NotFound') return false;
    // 其它错误（权限/网络）按"不确定"处理，向上抛出由调用方决定
    throw err;
  }
}

export function getR2Url(filename: string): string {
  return `${PUBLIC_URL}/${path.basename(filename)}`;
}
