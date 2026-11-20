#!/usr/bin/env node
// One-off: move documents uploaded before 2026-11-20 from Vercel Blob (public
// URLs) into the PRIVATE Cloudflare R2 bucket.
//
// For each `documents` row that has `fileUrl` and no `storageKey`:
//   1. download the file from its Blob URL
//   2. upload it to R2_PRIVATE_BUCKET as users/<userId>/documents/<rand>.<ext>
//   3. on that row: $set { storageKey, fileName }, $unset { fileUrl }
//   4. with --delete-blob: delete the old Blob file (needs BLOB_READ_WRITE_TOKEN)
// Nothing else is written. Rows already moved are skipped, so it's safe to re-run.
//
// Dry run (default — writes nothing, prints what it would do):
//   node --env-file=.env scripts/migrate-documents-to-r2.cjs
// Apply:
//   node --env-file=.env scripts/migrate-documents-to-r2.cjs --apply [--delete-blob]
//
// Run it against each database whose documents you want moved, with that
// environment's R2 settings (local DB → dev buckets, prod DB → prod buckets).
const mongoose = require('mongoose');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const APPLY = process.argv.includes('--apply');
const DELETE_BLOB = process.argv.includes('--delete-blob');
const EXT = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

function need(name) {
  if (!process.env[name]) { console.error(`Missing ${name}`); process.exit(1); }
  return process.env[name];
}

(async () => {
  const uri = need('MONGODB_URI');
  const bucket = need('R2_PRIVATE_BUCKET');
  const s3 = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT || `https://${need('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
    forcePathStyle: !!process.env.R2_ENDPOINT,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    credentials: { accessKeyId: need('R2_ACCESS_KEY_ID'), secretAccessKey: need('R2_SECRET_ACCESS_KEY') },
  });
  let del = null;
  if (DELETE_BLOB) {
    need('BLOB_READ_WRITE_TOKEN');
    ({ del } = require('@vercel/blob'));
  }

  await mongoose.connect(uri);
  const docs = mongoose.connection.db.collection('documents');
  const rows = await docs.find({ fileUrl: { $exists: true, $ne: null }, storageKey: { $exists: false } }).toArray();
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} — database "${mongoose.connection.db.databaseName}", bucket "${bucket}": ${rows.length} document(s) to move`);

  let moved = 0, failed = 0;
  for (const d of rows) {
    const userId = String(d.userId);
    const original = decodeURIComponent(String(d.fileUrl).split('/').pop() || 'file').replace(/^\d+-/, '').slice(0, 120);
    try {
      const res = await fetch(d.fileUrl);
      if (!res.ok) throw new Error(`download ${res.status}`);
      const type = (d.fileType || res.headers.get('content-type') || '').split(';')[0].toLowerCase();
      const ext = EXT[type] || 'bin';
      const key = `users/${userId}/documents/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}.${ext}`;
      const body = Buffer.from(await res.arrayBuffer());
      console.log(`  ${d._id}  ${d.documentType}  ${original}  (${body.length} bytes)  →  ${key}`);
      if (APPLY) {
        await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: type || 'application/octet-stream' }));
        await docs.updateOne({ _id: d._id, storageKey: { $exists: false } }, { $set: { storageKey: key, fileName: original }, $unset: { fileUrl: '' } });
        if (del) await del(d.fileUrl, { token: process.env.BLOB_READ_WRITE_TOKEN }).catch((e) => console.warn(`    (old Blob file not deleted: ${e.message})`));
      }
      moved++;
    } catch (err) {
      failed++;
      console.warn(`  ${d._id}  FAILED: ${err.message}`);
    }
  }
  console.log(`${APPLY ? 'Moved' : 'Would move'} ${moved}, failed ${failed}.${APPLY ? '' : ' Re-run with --apply to do it.'}`);
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
