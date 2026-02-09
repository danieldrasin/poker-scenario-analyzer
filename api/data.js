// Tier 2: Fetch pre-computed simulation data from Cloudflare R2
// This endpoint serves cached simulation results for common scenarios

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get R2 credentials from environment
  const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
  const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
  const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
  const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'poker-sim-data';

  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    return res.status(503).json({
      error: 'R2 not configured',
      message: 'Tier 2 data storage is not yet configured. Using Tier 1 bundled data.'
    });
  }

  // Parse request parameters
  const { game, players, category } = req.query;

  if (!game) {
    return res.status(400).json({ error: 'Missing required parameter: game' });
  }

  // Build the R2 object key
  // Format: {game}/{players}p/{category}.json or {game}/all.json
  let objectKey;
  if (category) {
    objectKey = `${game}/${players || 6}p/${category}.json`;
  } else if (players) {
    objectKey = `${game}/${players}p/all.json`;
  } else {
    objectKey = `${game}/all.json`;
  }

  try {
    // Fetch from R2 using S3-compatible API
    const r2Url = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET_NAME}/${objectKey}`;

    // Create AWS4 signature for R2 request
    const response = await fetchFromR2(r2Url, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ACCOUNT_ID, R2_BUCKET_NAME, objectKey);

    if (!response.ok) {
      if (response.status === 404) {
        return res.status(404).json({
          error: 'Data not found',
          message: `No pre-computed data for: ${objectKey}`,
          fallback: 'tier1'
        });
      }
      throw new Error(`R2 request failed: ${response.status}`);
    }

    const data = await response.json();

    // Cache the response for 1 hour
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).json({
      source: 'tier2-r2',
      key: objectKey,
      data: data
    });

  } catch (error) {
    console.error('R2 fetch error:', error);
    return res.status(500).json({
      error: 'Failed to fetch data',
      message: error.message,
      fallback: 'tier1'
    });
  }
}

// Fetch from R2 using AWS4 signature (S3-compatible)
async function fetchFromR2(url, accessKeyId, secretAccessKey, accountId, bucket, key) {
  const region = 'auto';
  const service = 's3';
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const datetime = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = datetime.slice(0, 8);

  const canonicalRequest = [
    'GET',
    `/${bucket}/${key}`,
    '',
    `host:${host}`,
    `x-amz-content-sha256:UNSIGNED-PAYLOAD`,
    `x-amz-date:${datetime}`,
    '',
    'host;x-amz-content-sha256;x-amz-date',
    'UNSIGNED-PAYLOAD'
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    datetime,
    `${date}/${region}/${service}/aws4_request`,
    await sha256(canonicalRequest)
  ].join('\n');

  const signingKey = await getSignatureKey(secretAccessKey, date, region, service);
  const signature = await hmacHex(signingKey, stringToSign);

  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${date}/${region}/${service}/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=${signature}`;

  return fetch(`https://${host}/${bucket}/${key}`, {
    method: 'GET',
    headers: {
      'Host': host,
      'x-amz-date': datetime,
      'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
      'Authorization': authorization
    }
  });
}

// Crypto helpers for AWS4 signature
async function sha256(message) {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmac(key, message) {
  const encoder = new TextEncoder();
  const keyData = typeof key === 'string' ? encoder.encode(key) : key;
  const messageData = encoder.encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );

  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, messageData));
}

async function hmacHex(key, message) {
  const result = await hmac(key, message);
  return Array.from(result).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getSignatureKey(secretKey, date, region, service) {
  const encoder = new TextEncoder();
  let key = await hmac(encoder.encode('AWS4' + secretKey), date);
  key = await hmac(key, region);
  key = await hmac(key, service);
  key = await hmac(key, 'aws4_request');
  return key;
}
