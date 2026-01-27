/**
 * Approval Token Utility
 * Creates and verifies secure tokens for batch approval via email links
 * Uses HMAC-SHA256 for signature + nonce for replay protection
 */

const ENCRYPTION_KEY = Deno.env.get("ENCRYPTION_KEY");

/**
 * Convert ArrayBuffer to hex string
 */
function arrayBufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert hex string to ArrayBuffer
 */
function hexToArrayBuffer(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes.buffer;
}

/**
 * Generate a random nonce (32 bytes hex = 64 chars)
 */
export function generateNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return arrayBufferToHex(bytes);
}

/**
 * Hash a nonce using SHA-256 for storage
 */
export async function hashNonce(nonce) {
  const encoder = new TextEncoder();
  const data = encoder.encode(nonce);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return arrayBufferToHex(hashBuffer);
}

/**
 * Get HMAC key from encryption key
 */
async function getHmacKey() {
  if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
    throw new Error('ENCRYPTION_KEY must be set and at least 32 characters');
  }
  
  const encoder = new TextEncoder();
  const keyData = encoder.encode(ENCRYPTION_KEY.slice(0, 32));
  
  return await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/**
 * Create HMAC signature for data
 */
async function createSignature(data) {
  const key = await getHmacKey();
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const signature = await crypto.subtle.sign('HMAC', key, dataBuffer);
  return arrayBufferToHex(signature);
}

/**
 * Verify HMAC signature
 */
async function verifySignature(data, signature) {
  const expectedSig = await createSignature(data);
  return expectedSig === signature;
}

/**
 * Create an approval token for a batch
 * 
 * Token format: base64({ batchId, nonce, expiresAt, signature })
 * 
 * @param {string} batchId - The ApprovalBatch ID
 * @param {number} expiryHours - Hours until token expires (default: 168 = 7 days)
 * @returns {Promise<{ token: string, nonce: string, nonceHash: string, expiresAt: string }>}
 */
export async function createApprovalToken(batchId, expiryHours = 168) {
  if (!batchId) {
    throw new Error('batchId is required');
  }
  
  // Generate nonce
  const nonce = generateNonce();
  const nonceHash = await hashNonce(nonce);
  
  // Calculate expiry
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + expiryHours);
  const expiresAtISO = expiresAt.toISOString();
  
  // Create data to sign
  const dataToSign = `${batchId}|${nonce}|${expiresAtISO}`;
  const signature = await createSignature(dataToSign);
  
  // Create token payload
  const payload = {
    b: batchId,      // batch ID
    n: nonce,        // nonce
    e: expiresAtISO, // expires at
    s: signature     // signature
  };
  
  // Encode as base64
  const token = btoa(JSON.stringify(payload));
  
  return {
    token,
    nonce,
    nonceHash,
    expiresAt: expiresAtISO
  };
}

/**
 * Verify and decode an approval token
 * 
 * @param {string} token - The approval token
 * @returns {Promise<{ valid: boolean, batchId?: string, nonce?: string, nonceHash?: string, expiresAt?: string, error?: string }>}
 */
export async function verifyApprovalToken(token) {
  try {
    // Decode token
    const payloadJson = atob(token);
    const payload = JSON.parse(payloadJson);
    
    const { b: batchId, n: nonce, e: expiresAt, s: signature } = payload;
    
    if (!batchId || !nonce || !expiresAt || !signature) {
      return { valid: false, error: 'Invalid token structure' };
    }
    
    // Check expiry
    const expiryDate = new Date(expiresAt);
    if (expiryDate < new Date()) {
      return { valid: false, error: 'Token expired', batchId };
    }
    
    // Verify signature
    const dataToVerify = `${batchId}|${nonce}|${expiresAt}`;
    const signatureValid = await verifySignature(dataToVerify, signature);
    
    if (!signatureValid) {
      return { valid: false, error: 'Invalid signature', batchId };
    }
    
    // Calculate nonce hash for replay check
    const nonceHash = await hashNonce(nonce);
    
    return {
      valid: true,
      batchId,
      nonce,
      nonceHash,
      expiresAt
    };
    
  } catch (error) {
    return { valid: false, error: `Token decode failed: ${error.message}` };
  }
}

/**
 * Generate approval URL for email
 * 
 * @param {string} token - The approval token
 * @param {string} action - 'approve' or 'reject'
 * @returns {string} - Full URL for approval action
 */
export function generateApprovalUrl(token, action = 'approve') {
  const baseUrl = Deno.env.get("APP_BASE_URL") || 'https://app.base44.com';
  const encodedToken = encodeURIComponent(token);
  return `${baseUrl}/api/approveAction?token=${encodedToken}&action=${action}`;
}