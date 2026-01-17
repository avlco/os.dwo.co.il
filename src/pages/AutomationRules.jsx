import React from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import AutomationRulesManager from '../components/settings/AutomationRulesManager';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';

export default function AutomationRules() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-200">חוקי אוטומציה</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            ניהול חוקים אוטומטיים לעיבוד דואר נכנס
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => navigate(createPageUrl('MailRoom'))}
          className="gap-2"
        >
          <ArrowRight className="w-4 h-4" />
          חזרה לחדר דואר
        </Button>
      </div>
      
      <div className="max-w-4xl mx-auto">
        <AutomationRulesManager />
      </div>
    </div>
  );
}
