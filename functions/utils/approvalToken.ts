/**
 * Approval Token Utility
 * HMAC-SHA256 signed tokens for secure batch approval
 * 
 * Token structure: base64(payload).base64url(signature)
 * Payload: { v, batch_id, approver_email, action, exp, iat, nonce }
 */

/**
 * Sign an approval token using HMAC-SHA256
 * @param {object} payload - Token payload
 * @param {string} secret - HMAC secret key
 * @returns {Promise<string>} - Signed token
 */
export async function signApprovalToken(payload, secret) {
  if (!secret) {
    throw new Error('APPROVAL_HMAC_SECRET is required');
  }

  const payloadJson = JSON.stringify(payload);
  const payloadB64 = btoa(unescape(encodeURIComponent(payloadJson)));
  
  // Create HMAC-SHA256 signature
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(payloadB64)
  );
  
  // Convert to base64url
  const signatureArray = new Uint8Array(signatureBuffer);
  let signatureB64 = btoa(String.fromCharCode(...signatureArray));
  signatureB64 = signatureB64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  
  return `${payloadB64}.${signatureB64}`;
}

/**
 * Verify and decode an approval token
 * @param {string} token - Signed token
 * @param {string} secret - HMAC secret key
 * @returns {Promise<object|null>} - Decoded payload or null if invalid
 */
export async function verifyApprovalToken(token, secret) {
  if (!token || !secret) {
    return null;
  }

  try {
    const parts = token.split('.');
    if (parts.length !== 2) {
      console.log('[Token] Invalid format: expected 2 parts');
      return null;
    }

    const [payloadB64, signatureB64] = parts;
    
    // Verify signature
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    
    // Convert base64url signature back to ArrayBuffer
    let sigB64Standard = signatureB64.replace(/-/g, '+').replace(/_/g, '/');
    while (sigB64Standard.length % 4) sigB64Standard += '=';
    const sigBinary = atob(sigB64Standard);
    const sigArray = new Uint8Array(sigBinary.length);
    for (let i = 0; i < sigBinary.length; i++) {
      sigArray[i] = sigBinary.charCodeAt(i);
    }
    
    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigArray,
      encoder.encode(payloadB64)
    );
    
    if (!isValid) {
      console.log('[Token] Invalid signature');
      return null;
    }
    
    // Decode payload
    const payloadJson = decodeURIComponent(escape(atob(payloadB64)));
    const payload = JSON.parse(payloadJson);
    
    // Verify version
    if (payload.v !== 1) {
      console.log('[Token] Unsupported version:', payload.v);
      return null;
    }
    
    // Verify expiry
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && now > payload.exp) {
      console.log('[Token] Token expired:', new Date(payload.exp * 1000));
      return null;
    }
    
    return payload;
  } catch (error) {
    console.error('[Token] Verification error:', error.message);
    return null;
  }
}

/**
 * Hash a nonce using HMAC-SHA256 with derived key
 * @param {string} nonce - Random nonce string
 * @param {string} secret - HMAC secret key
 * @returns {Promise<string>} - Hex-encoded hash
 */
export async function hashNonce(nonce, secret) {
  if (!nonce || !secret) {
    throw new Error('Nonce and secret are required');
  }

  // Derive a separate key for nonce hashing (domain separation)
  const derivedKey = `nonce:${secret}`;
  
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(derivedKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const hashBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(nonce)
  );
  
  // Convert to hex
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a cryptographically secure random nonce
 * @returns {string} - Random UUID-like nonce
 */
export function generateNonce() {
  return crypto.randomUUID();
}

/**
 * Create a complete approval token payload
 * @param {object} params - Token parameters
 * @returns {object} - Token payload
 */
export function createTokenPayload({ batchId, approverEmail, expiresInMinutes = 60 }) {
  const now = Math.floor(Date.now() / 1000);
  
  return {
    v: 1,
    batch_id: batchId,
    approver_email: approverEmail,
    action: 'approve',
    exp: now + (expiresInMinutes * 60),
    iat: now,
    nonce: generateNonce()
  };
}