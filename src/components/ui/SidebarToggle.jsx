import React from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Button } from "@/components/ui/button";

export default function SidebarToggle({ isCollapsed, onToggle, className = '' }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onToggle}
      className={`rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 ${className}`}
      title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
    >
      {isCollapsed ? (
        <PanelLeftOpen className="w-5 h-5 text-slate-600 dark:text-slate-300" />
      ) : (
        <PanelLeftClose className="w-5 h-5 text-slate-600 dark:text-slate-300" />
      )}
    </Button>
  );
}