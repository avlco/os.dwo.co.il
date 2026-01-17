import React from 'react';
import PageHeader from '../components/ui/PageHeader';
import AutomationRulesManager from '../components/settings/AutomationRulesManager';

export default function AutomationRules() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="חוקי אוטומציה"
        subtitle="ניהול חוקים אוטומטיים לעיבוד דואר נכנס"
      />
      <div className="max-w-4xl mx-auto">
        <AutomationRulesManager />
      </div>
    </div>
  );
}
