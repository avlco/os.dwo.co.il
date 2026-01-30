import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { base44 } from '@/api/base44Client';
import { Loader2, CheckCircle, XCircle, AlertTriangle, ExternalLink } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Quick Approval Page
 * 
 * This page is opened when user clicks the approval link from email.
 * It extracts the token from URL and POSTs it to the approval endpoint.
 * 
 * URL format: /ApproveBatch?token=...
 * 
 * Security: Token is sent via POST body, not exposed in subsequent requests.
 */
export default function ApproveBatch() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading'); // loading, success, error, expired, already_used
  const [message, setMessage] = useState('');
  const [batchId, setBatchId] = useState(null);
  const [executionSummary, setExecutionSummary] = useState(null);
  const [editUrl, setEditUrl] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    if (!token) {
      setStatus('error');
      setMessage('לא סופק טוקן אישור');
      return;
    }

    // Clear token from URL for security
    window.history.replaceState({}, '', createPageUrl('ApproveBatch'));

    // Process approval
    processApproval(token);
  }, []);

  async function processApproval(token) {
    try {
      setStatus('loading');
      setMessage('מעבד אישור...');

      const raw = await base44.functions.invoke('approveAutomationBatchPublic', { token });
      const response = raw.data || raw;

      if (response.success) {
        setStatus('success');
        setBatchId(response.batch_id);
        setExecutionSummary(response.execution_summary);
        setMessage(response.message || 'האישור בוצע בהצלחה');
      } else {
        handleErrorResponse(response);
      }
    } catch (error) {
      console.error('Approval error:', error);
      
      // Try to parse error response
      if (error.response?.data) {
        handleErrorResponse(error.response.data);
      } else {
        setStatus('error');
        setMessage(error.message || 'שגיאה בעיבוד האישור');
      }
    }
  }

  function handleErrorResponse(response) {
    setBatchId(response.batch_id);
    
    switch (response.code) {
      case 'INVALID_TOKEN':
        setStatus('error');
        setMessage('קישור האישור אינו תקף או שפג תוקפו');
        break;
      
      case 'BATCH_EXPIRED':
      case 'TOKEN_EXPIRED':
        setStatus('expired');
        setMessage('קישור האישור המהיר פג תוקף. ניתן לאשר מתוך המערכת.');
        setEditUrl(response.edit_url || (response.batch_id ? createPageUrl('ApprovalBatchEdit') + `?batchId=${response.batch_id}` : null));
        break;
      
      case 'TOKEN_ALREADY_USED':
        setStatus('already_used');
        setMessage('קישור זה כבר נוצל. ייתכן שהאישור כבר בוצע.');
        break;
      
      case 'ALREADY_PROCESSED':
        setStatus('already_used');
        setMessage(`הבאטש כבר ${response.status === 'executed' ? 'בוצע' : response.status === 'cancelled' ? 'בוטל' : 'טופל'}`);
        break;
      
      case 'APPROVER_MISMATCH':
        setStatus('error');
        setMessage('אינך מורשה לאשר בקשה זו');
        break;
      
      default:
        setStatus('error');
        setMessage(response.message || 'שגיאה בעיבוד האישור');
    }
  }

  function goToQueue() {
    navigate(createPageUrl('ApprovalQueue'));
  }

  function goToEdit() {
    if (batchId) {
      navigate(createPageUrl('ApprovalBatchEdit') + `?batchId=${batchId}`);
    } else if (editUrl) {
      window.location.href = editUrl;
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardContent className="pt-8 pb-6 text-center">
          
          {/* Loading State */}
          {status === 'loading' && (
            <div className="space-y-4">
              <Loader2 className="w-16 h-16 mx-auto text-blue-600 animate-spin" />
              <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200">
                מעבד אישור...
              </h2>
              <p className="text-slate-600 dark:text-slate-400">
                אנא המתן
              </p>
            </div>
          )}

          {/* Success State */}
          {status === 'success' && (
            <div className="space-y-4">
              <CheckCircle className="w-16 h-16 mx-auto text-green-600" />
              <h2 className="text-xl font-semibold text-green-700 dark:text-green-400">
                האישור בוצע בהצלחה!
              </h2>
              <p className="text-slate-600 dark:text-slate-400">
                {message}
              </p>
              
              {executionSummary && (
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 mt-4 text-right">
                  <p className="text-sm text-green-800 dark:text-green-300">
                    <strong>{executionSummary.success}</strong> פעולות בוצעו בהצלחה
                  </p>
                  {executionSummary.failed > 0 && (
                    <p className="text-sm text-orange-600 dark:text-orange-400 mt-1">
                      <strong>{executionSummary.failed}</strong> פעולות נכשלו
                    </p>
                  )}
                  {executionSummary.skipped > 0 && (
                    <p className="text-sm text-slate-500 mt-1">
                      <strong>{executionSummary.skipped}</strong> פעולות דולגו
                    </p>
                  )}
                </div>
              )}

              <Button onClick={goToQueue} className="mt-4 w-full">
                לתור האישורים
              </Button>
            </div>
          )}

          {/* Error State */}
          {status === 'error' && (
            <div className="space-y-4">
              <XCircle className="w-16 h-16 mx-auto text-red-600" />
              <h2 className="text-xl font-semibold text-red-700 dark:text-red-400">
                שגיאה
              </h2>
              <p className="text-slate-600 dark:text-slate-400">
                {message}
              </p>
              <Button onClick={goToQueue} variant="outline" className="mt-4 w-full">
                לתור האישורים
              </Button>
            </div>
          )}

          {/* Expired State */}
          {status === 'expired' && (
            <div className="space-y-4">
              <AlertTriangle className="w-16 h-16 mx-auto text-amber-500" />
              <h2 className="text-xl font-semibold text-amber-700 dark:text-amber-400">
                הקישור פג תוקף
              </h2>
              <p className="text-slate-600 dark:text-slate-400">
                {message}
              </p>
              <div className="flex gap-2 mt-4">
                <Button onClick={goToEdit} className="flex-1 gap-2">
                  <ExternalLink className="w-4 h-4" />
                  פתח לעריכה
                </Button>
                <Button onClick={goToQueue} variant="outline" className="flex-1">
                  לתור האישורים
                </Button>
              </div>
            </div>
          )}

          {/* Already Used State */}
          {status === 'already_used' && (
            <div className="space-y-4">
              <AlertTriangle className="w-16 h-16 mx-auto text-blue-500" />
              <h2 className="text-xl font-semibold text-blue-700 dark:text-blue-400">
                כבר טופל
              </h2>
              <p className="text-slate-600 dark:text-slate-400">
                {message}
              </p>
              <Button onClick={goToQueue} variant="outline" className="mt-4 w-full">
                לתור האישורים
              </Button>
            </div>
          )}

        </CardContent>
      </Card>
    </div>
  );
}