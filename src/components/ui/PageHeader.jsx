import React from 'react';
import { Button } from "@/components/ui/button";
import { Plus } from 'lucide-react';

export function PageHeader({ title, subtitle, action, actionLabel, actionIcon: ActionIcon = Plus }) {
  return (
    <div className="flex items-center justify-between mb-8 gap-4">
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">{title}</h1>
        {subtitle && <p className="text-slate-500 dark:text-slate-400 mt-1">{subtitle}</p>}
      </div>
      {action && (
        <Button 
          onClick={action}
          className="bg-slate-800 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 text-white gap-2 rounded-xl px-5 shadow-sm flex-shrink-0"
        >
          <ActionIcon className="w-4 h-4" />
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

export default PageHeader;