#!/usr/bin/env node
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../backend/.env') });

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
});

const UPLOAD_DIR = path.resolve(__dirname, '../backend/public/uploads');
const BUCKET = process.env.R2_BUCKET || 'imageanimap';

async function main() {
  const files = fs.readdirSync(UPLOAD_DIR);
  const imageFiles = files.filter(f => /\.(webp|jpg|jpeg|png)$/i.test(f));

  console.log(`Found ${imageFiles.length} images to upload\n`);

  let uploaded = 0;
  let skipped = 0;
  let errors = 0;

  for (const file of imageFiles) {
    const filePath = path.join(UPLOAD_DIR, file);
    const stat = fs.statSync(filePath);

    // Skip empty files
    if (stat.size === 0) { skipped++; continue; }

    try {
      const body = fs.readFileSync(filePath);
      const ext = path.extname(file).toLowerCase();
      const contentType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
        : ext === '.png' ? 'image/png'
        : 'image/webp';

      await r2.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: file,
        Body: body,
        ContentType: contentType,
      }));

      uploaded++;
      if (uploaded % 50 === 0) console.log(`  uploaded ${uploaded}/${imageFiles.length}...`);
    } catch (err) {
      console.error(`  ERROR ${file}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\nDone: ${uploaded} uploaded, ${skipped} skipped, ${errors} errors`);
}

main().catch(e => { console.error(e); process.exit(1); });
