// scripts/testCloudflareR2.mjs
// Diagnostic tool to test Cloudflare R2 Bucket Connection & Operations

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { S3Client, ListObjectsV2Command, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Load environment variables from proxy/.env if present
const proxyEnvPath = path.join(rootDir, 'proxy', '.env');
if (fs.existsSync(proxyEnvPath)) {
  const content = fs.readFileSync(proxyEnvPath, 'utf8');
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const val = match[2].trim().replace(/^['"]|['"]$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  });
}

const accountId = process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CLOUDFLARE_R2_ACCOUNT_ID || '';
const accessKeyId = process.env.R2_ACCESS_KEY_ID || process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || '';
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || '';
const bucketName = process.env.R2_BUCKET_NAME || process.env.CLOUDFLARE_R2_BUCKET || 'drabyashree-floorsheets';
const publicUrl = process.env.R2_PUBLIC_URL || process.env.CLOUDFLARE_R2_PUBLIC_URL || '';

console.log('====================================================');
console.log('       Cloudflare R2 Diagnostic & Verification      ');
console.log('====================================================\n');

console.log('1. Checking Configuration:');
console.log(` - Account ID        : ${accountId ? accountId.slice(0, 6) + '...' + accountId.slice(-4) : '❌ MISSING'}`);
console.log(` - Access Key ID     : ${accessKeyId ? accessKeyId.slice(0, 6) + '...' : '❌ MISSING'}`);
console.log(` - Secret Access Key : ${secretAccessKey ? '••••••••••••••••' : '❌ MISSING'}`);
console.log(` - Bucket Name       : ${bucketName || '❌ MISSING'}`);
console.log(` - Public URL / CDN  : ${publicUrl || '(Optional - not configured)'}\n`);

if (!accountId || !accessKeyId || !secretAccessKey) {
  console.error('❌ Cloudflare R2 credentials are incomplete.');
  console.log('Please add the following to proxy/.env or your host environment variables:');
  console.log(`
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_BUCKET_NAME=${bucketName}
`);
  process.exit(1);
}

const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
console.log(`2. Connecting to S3 Endpoint: ${endpoint}...`);

const s3 = new S3Client({
  region: 'auto',
  endpoint,
  credentials: {
    accessKeyId,
    secretAccessKey
  }
});

async function runTest() {
  try {
    // Step A: List objects
    console.log(`3. Listing objects in bucket '${bucketName}'...`);
    const listRes = await s3.send(new ListObjectsV2Command({
      Bucket: bucketName,
      MaxKeys: 10
    }));

    const count = listRes.Contents ? listRes.Contents.length : 0;
    console.log(`   ✅ Success! Connection verified. Found ${count} object(s) in bucket.`);
    if (count > 0) {
      listRes.Contents.forEach((c, idx) => {
        console.log(`      ${idx + 1}. ${c.Key} (${(c.Size / 1024).toFixed(1)} KB)`);
      });
    }

    // Step B: Write a lightweight test ping
    console.log('\n4. Testing write permission (PutObject)...');
    const testKey = '_test_ping.json';
    const testPayload = JSON.stringify({ ping: 'ok', timestamp: new Date().toISOString(), app: 'Drabyashree NEPSE' });
    await s3.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: testKey,
      Body: Buffer.from(testPayload, 'utf8'),
      ContentType: 'application/json'
    }));
    console.log(`   ✅ Write test succeeded! Uploaded '${testKey}'.`);

    // Step C: Read back test ping
    console.log('\n5. Testing read permission (GetObject)...');
    const getRes = await s3.send(new GetObjectCommand({
      Bucket: bucketName,
      Key: testKey
    }));
    const bytes = await getRes.Body.transformToByteArray();
    const readBack = JSON.parse(Buffer.from(bytes).toString('utf8'));
    console.log(`   ✅ Read test succeeded! Verified payload: ${readBack.timestamp}`);

    console.log('\n🎉 ALL TESTS PASSED! Your Cloudflare R2 bucket is fully operational with Drabyashree NEPSE.');
  } catch (err) {
    console.error('\n❌ Error during Cloudflare R2 operation:');
    console.error(err.message);
    if (err.name === 'NoSuchBucket') {
      console.error(`\nBucket '${bucketName}' does not exist under Account ID '${accountId}'. Please check the bucket name spelling in Cloudflare Dashboard.`);
    } else if (err.name === 'InvalidAccessKeyId' || err.name === 'SignatureDoesNotMatch') {
      console.error('\nInvalid Access Key ID or Secret Access Key. Please check the token permissions and copy the secret key again.');
    }
    process.exit(1);
  }
}

runTest();
