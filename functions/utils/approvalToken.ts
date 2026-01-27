/**
 * Approval Token Utility (TypeScript)
 * HMAC-SHA256 signed tokens for secure batch approval
 * 
 * Token structure: base64url(payload).base64url(signature)
 * Payload: { v, batch_id, approver_email, action, exp, iat, nonce }
 */

// Base64URL encode (safe for URLs, handles Unicode)
function base64UrlEncode(data: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...data));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Base64URL decode
function base64UrlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Encode string to Uint8Array (UTF-8)
function stringToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

// Decode Uint8Array to string (UTF-8)
function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

export interface TokenPayload {
  v: number;
  batch_id: string;
  approver_email: string;
  action: string;
  exp: number;
  iat: number;
  nonce: string;
}

export interface CreateTokenPayloadParams {
  batchId: string;
  approverEmail: string;
  expiresInMinutes?: number;
}

/**
 * Sign an approval token using HMAC-SHA256
 */
export async function signApprovalToken(payload: TokenPayload, secret: string): Promise<string> {
  if (!secret) {
    throw new Error('APPROVAL_HMAC_SECRET is required');
  }

  const payloadJson = JSON.stringify(payload);
  const payloadBytes = stringToBytes(payloadJson);
  const payloadB64 = base64UrlEncode(payloadBytes);
  
  // Create HMAC-SHA256 signature
  const key = await crypto.subtle.importKey(
    'raw',
    stringToBytes(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    stringToBytes(payloadB64)
  );
  
  const signatureB64 = base64UrlEncode(new Uint8Array(signatureBuffer));
  
  return `${payloadB64}.${signatureB64}`;
}

/**
 * Verify and decode an approval token
 */
export async function verifyApprovalToken(token: string, secret: string): Promise<TokenPayload | null> {
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
    const key = await crypto.subtle.importKey(
      'raw',
      stringToBytes(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    
    const sigArray = base64UrlDecode(signatureB64);
    
    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigArray,
      stringToBytes(payloadB64)
    );
    
    if (!isValid) {
      console.log('[Token] Invalid signature');
      return null;
    }
    
    // Decode payload
    const payloadBytes = base64UrlDecode(payloadB64);
    const payloadJson = bytesToString(payloadBytes);
    const payload: TokenPayload = JSON.parse(payloadJson);
    
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
    console.error('[Token] Verification error:', (error as Error).message);
    return null;
  }
}

/**
 * Hash a nonce using HMAC-SHA256 with derived key
 */
export async function hashNonce(nonce: string, secret: string): Promise<string> {
  if (!nonce || !secret) {
    throw new Error('Nonce and secret are required');
  }

  // Derive a separate key for nonce hashing (domain separation)
  const derivedKey = `nonce:${secret}`;
  
  const key = await crypto.subtle.importKey(
    'raw',
    stringToBytes(derivedKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const hashBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    stringToBytes(nonce)
  );
  
  // Convert to hex
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a cryptographically secure random nonce
 */
export function generateNonce(): string {
  return crypto.randomUUID();
}

/**
 * Create a complete approval token payload
 */
export function createTokenPayload({ batchId, approverEmail, expiresInMinutes = 60 }: CreateTokenPayloadParams): TokenPayload {
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