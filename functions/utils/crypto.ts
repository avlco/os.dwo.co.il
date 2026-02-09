/**
 * Encryption Utility for IntegrationConnection tokens
 * Uses AES-256-GCM for secure encryption at rest
 * 
 * IMPORTANT: Set ENCRYPTION_SECRET_KEY in environment variables (32 characters)
 */

const ENCRYPTION_SECRET_KEY = Deno.env.get("ENCRYPTION_SECRET_KEY");

/**
 * Convert string to ArrayBuffer
 */
function stringToArrayBuffer(str) {
  return new TextEncoder().encode(str);
}

/**
 * Convert ArrayBuffer to string
 */
function arrayBufferToString(buffer) {
  return new TextDecoder().decode(buffer);
}

/**
 * Convert ArrayBuffer to Base64
 */
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert Base64 to ArrayBuffer
 */
function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Get the encryption key as CryptoKey
 */
async function getKey() {
  if (!ENCRYPTION_SECRET_KEY || ENCRYPTION_SECRET_KEY.length < 32) {
    throw new Error('ENCRYPTION_SECRET_KEY must be set and at least 32 characters');
  }
  
  const keyMaterial = stringToArrayBuffer(ENCRYPTION_SECRET_KEY.slice(0, 32));
  
  return await crypto.subtle.importKey(
    'raw',
    keyMaterial,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt a plaintext string
 * Returns base64 encoded string containing IV + ciphertext
 * 
 * @param {string} plaintext - The text to encrypt
 * @returns {Promise<string>} - Base64 encoded encrypted data
 */
export async function encrypt(plaintext) {
  if (!plaintext) return '';
  
  const key = await getKey();
  
  // Generate random IV (12 bytes for GCM)
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const encodedText = stringToArrayBuffer(plaintext);
  
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encodedText
  );
  
  // Combine IV + ciphertext
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  
  return arrayBufferToBase64(combined.buffer);
}

/**
 * Decrypt an encrypted string
 * Expects base64 encoded string containing IV + ciphertext
 * 
 * @param {string} encryptedBase64 - Base64 encoded encrypted data
 * @returns {Promise<string>} - Decrypted plaintext
 */
export async function decrypt(encryptedBase64) {
  if (!encryptedBase64) return '';
  
  const key = await getKey();
  
  const combined = new Uint8Array(base64ToArrayBuffer(encryptedBase64));
  
  // Extract IV (first 12 bytes) and ciphertext
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  
  return arrayBufferToString(decrypted);
}

/**
 * Helper: Encrypt token data for storage
 * @param {object} tokenData - Object containing access_token and refresh_token
 * @returns {Promise<object>} - Object with encrypted tokens
 */
export async function encryptTokens(tokenData) {
  return {
    access_token_encrypted: await encrypt(tokenData.access_token),
    refresh_token_encrypted: tokenData.refresh_token ? await encrypt(tokenData.refresh_token) : null,
  };
}

/**
 * Helper: Decrypt token data from storage
 * @param {object} encryptedData - Object with encrypted tokens
 * @returns {Promise<object>} - Object with decrypted tokens
 */
export async function decryptTokens(encryptedData) {
  return {
    access_token: await decrypt(encryptedData.access_token_encrypted),
    refresh_token: encryptedData.refresh_token_encrypted ? await decrypt(encryptedData.refresh_token_encrypted) : null,
  };
}