/**
 * Public endpoint for quick approval via email link
 * 
 * Security:
 * - HMAC-SHA256 signed token
 * - Nonce for anti-replay protection
 * - Token expiry (60 minutes)
 * - Approver email verification
 * - Strict CORS origin validation
 * 
 * Flow:
 * 1. Validate CORS origin (403 if not allowed)
 * 2. Verify token signature
 * 3. Verify token not expired
 * 4. Verify nonce not used (anti-replay)
 * 5. Verify batch exists and is pending
 * 6. Mark batch as approved and execute
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { verifyApprovalToken, hashNonce } from './utils/approvalToken.js';
import { executeBatchActions } from './utils/batchExecutor.js';

/**
 * Build list of allowed CORS origins
 */
function getAllowedOrigins() {
  const allowedOrigins = [];
  
  const appBaseUrl = Deno.env.get('APP_BASE_URL');
  if (appBaseUrl) {
    // Add exact URL
    allowedOrigins.push(appBaseUrl);
    // Also add without trailing slash if present
    if (appBaseUrl.endsWith('/')) {
      allowedOrigins.push(appBaseUrl.slice(0, -1));
    }
  }
  
  // Add base44 domains
  allowedOrigins.push('https://preview.base44.com');
  allowedOrigins.push('https://app.base44.com');
  
  return allowedOrigins;
}

/**
 * Check if origin is allowed (strict equality check)
 */
function isOriginAllowed(requestOrigin, allowedOrigins) {
  if (!requestOrigin) return false;
  return allowedOrigins.some(allowed => requestOrigin === allowed);
}

/**
 * Get CORS headers for allowed origin
 */
function getCorsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'content-type, authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  };
}

Deno.serve(async (req) => {
  const requestOrigin = req.headers.get('origin');
  const allowedOrigins = getAllowedOrigins();
  
  // CORS validation - strict equality check
  if (requestOrigin && !isOriginAllowed(requestOrigin, allowedOrigins)) {
    console.log(`[ApprovePublic] Forbidden origin: ${requestOrigin}`);
    return Response.json(
      { success: false, code: 'FORBIDDEN_ORIGIN', message: 'Origin not allowed' },
      { status: 403 }
    );
  }
  
  // Get CORS headers for valid origin
  const corsHeaders = requestOrigin ? getCorsHeaders(requestOrigin) : {};
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return Response.json(
      { success: false, code: 'METHOD_NOT_ALLOWED', message: 'Only POST is allowed' },
      { status: 405, headers: corsHeaders }
    );
  }

  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { token } = body;

    if (!token) {
      return Response.json(
        { success: false, code: 'MISSING_TOKEN', message: 'Token is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    console.log('[ApprovePublic] Processing approval request');

    // 1. Get HMAC secret
    const secret = Deno.env.get('APPROVAL_HMAC_SECRET');
    if (!secret) {
      console.error('[ApprovePublic] APPROVAL_HMAC_SECRET not configured');
      return Response.json(
        { success: false, code: 'CONFIG_ERROR', message: 'Server configuration error' },
        { status: 500, headers: corsHeaders }
      );
    }

    // 2. Verify token signature and expiry
    const payload = await verifyApprovalToken(token, secret);
    
    if (!payload) {
      console.log('[ApprovePublic] Token verification failed');
      return Response.json(
        { success: false, code: 'INVALID_TOKEN', message: 'Invalid or expired token' },
        { status: 401, headers: corsHeaders }
      );
    }

    console.log(`[ApprovePublic] Token valid for batch: ${payload.batch_id}`);

    // 3. Fetch batch
    const batch = await base44.asServiceRole.entities.ApprovalBatch.get(payload.batch_id);
    
    if (!batch) {
      console.log(`[ApprovePublic] Batch not found: ${payload.batch_id}`);
      return Response.json(
        { success: false, code: 'BATCH_NOT_FOUND', message: 'Approval batch not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    // 4. Verify approver matches
    if (batch.approver_email !== payload.approver_email) {
      console.log(`[ApprovePublic] Approver mismatch: ${batch.approver_email} vs ${payload.approver_email}`);
      return Response.json(
        { success: false, code: 'APPROVER_MISMATCH', message: 'Token not valid for this approver' },
        { status: 403, headers: corsHeaders }
      );
    }

    // 5. Check batch status
    if (['approved', 'executed', 'cancelled', 'executing'].includes(batch.status)) {
      console.log(`[ApprovePublic] Batch already processed: ${batch.status}`);
      return Response.json(
        { 
          success: false, 
          code: 'ALREADY_PROCESSED', 
          message: `Batch already ${batch.status}`,
          batch_id: batch.id,
          status: batch.status
        },
        { status: 409, headers: corsHeaders }
      );
    }

    // 6. Check batch expiry (double-check beyond token expiry)
    if (new Date(batch.expires_at) < new Date()) {
      const appUrl = Deno.env.get('APP_BASE_URL') || 'https://app.base44.com';
      const editUrl = `${appUrl}/ApprovalBatchEdit?batchId=${batch.id}`;
      
      console.log(`[ApprovePublic] Batch expired: ${batch.expires_at}`);
      return Response.json(
        { 
          success: false, 
          code: 'BATCH_EXPIRED', 
          message: 'Quick approval link expired. Please approve from the app.',
          batch_id: batch.id,
          edit_url: editUrl
        },
        { status: 410, headers: corsHeaders }
      );
    }

    // 7. Check nonce (anti-replay) - UNIQUE constraint handles duplicates
    const nonceHash = await hashNonce(payload.nonce, secret);
    
    try {
      // Try to create nonce record - will fail if already exists due to UNIQUE constraint
      await base44.asServiceRole.entities.ApprovalNonce.create({
        batch_id: batch.id,
        nonce_hash: nonceHash,
        expires_at: batch.expires_at,
        used_at: new Date().toISOString(),
        used_meta: {
          ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
          user_agent: req.headers.get('user-agent') || 'unknown'
        }
      });
    } catch (nonceError) {
      // Check if it's a duplicate (UNIQUE constraint violation)
      // Fallback: query to verify
      const existingNonces = await base44.asServiceRole.entities.ApprovalNonce.filter({
        batch_id: batch.id,
        nonce_hash: nonceHash
      });
      
      if (existingNonces && existingNonces.length > 0) {
        console.log(`[ApprovePublic] Nonce already used (replay attempt)`);
        return Response.json(
          { 
            success: false, 
            code: 'TOKEN_ALREADY_USED', 
            message: 'This approval link has already been used',
            batch_id: batch.id
          },
          { status: 409, headers: corsHeaders }
        );
      }
      
      // Re-throw if it's a different error
      throw nonceError;
    }

    console.log('[ApprovePublic] Nonce validated, proceeding with approval');

    // 8. Update batch status to approved
    await base44.asServiceRole.entities.ApprovalBatch.update(batch.id, {
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_via: 'email_link',
      approved_by_email: payload.approver_email
    });

    // 9. Update to executing
    await base44.asServiceRole.entities.ApprovalBatch.update(batch.id, {
      status: 'executing'
    });

    // 10. Re-fetch batch to get latest actions_current
    const freshBatch = await base44.asServiceRole.entities.ApprovalBatch.get(batch.id);
    
    // 11. Execute actions
    let executionSummary;
    let finalStatus = 'executed';
    
    try {
      executionSummary = await executeBatchActions(base44, freshBatch, {
        executedBy: 'email_link',
        userEmail: payload.approver_email
      });
      
      // If any action failed, status is failed
      if (executionSummary.failed > 0) {
        finalStatus = 'failed';
      }
    } catch (execError) {
      console.error('[ApprovePublic] Execution error:', execError);
      finalStatus = 'failed';
      executionSummary = {
        total: batch.actions_current.length,
        success: 0,
        failed: batch.actions_current.length,
        skipped: 0,
        results: [],
        error: execError.message,
        executed_at: new Date().toISOString()
      };
    }

    // 12. Update batch with final status
    await base44.asServiceRole.entities.ApprovalBatch.update(batch.id, {
      status: finalStatus,
      execution_summary: executionSummary,
      error_message: finalStatus === 'failed' ? (executionSummary.error || 'Execution failed') : null
    });

    console.log(`[ApprovePublic] Batch ${batch.id} completed with status: ${finalStatus}`);

    // Return success response
    return Response.json(
      {
        success: finalStatus === 'executed',
        batch_id: batch.id,
        status: finalStatus,
        execution_summary: executionSummary,
        message: finalStatus === 'executed' 
          ? `Successfully executed ${executionSummary.success} action(s)` 
          : `Execution completed with ${executionSummary.failed} failure(s)`
      },
      { status: finalStatus === 'executed' ? 200 : 207, headers: corsHeaders }
    );

  } catch (error) {
    console.error('[ApprovePublic] Unexpected error:', error);
    return Response.json(
      { 
        success: false, 
        code: 'INTERNAL_ERROR', 
        message: error.message 
      },
      { status: 500, headers: corsHeaders }
    );
  }
});