import React from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search, LayoutGrid, List } from 'lucide-react';

export default function TasksToolbar({
  viewMode,
  onViewModeChange,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  priorityFilter,
  onPriorityFilterChange,
  onNewTask,
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-200">
            {t('tasks_page.title')}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
            <Button
              variant={viewMode === 'board' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => onViewModeChange('board')}
              className={`gap-1.5 ${viewMode === 'board' ? 'shadow-sm' : 'hover:bg-slate-200 dark:hover:bg-slate-700'}`}
            >
              <LayoutGrid className="w-4 h-4" />
              {t('tasks_page.board_view')}
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => onViewModeChange('list')}
              className={`gap-1.5 ${viewMode === 'list' ? 'shadow-sm' : 'hover:bg-slate-200 dark:hover:bg-slate-700'}`}
            >
              <List className="w-4 h-4" />
              {t('tasks_page.list_view')}
            </Button>
          </div>
          <Button onClick={onNewTask} className="gap-1.5 bg-slate-800 hover:bg-slate-700 dark:bg-slate-700">
            <Plus className="w-4 h-4" />
            {t('tasks_page.new_task')}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder={t('tasks_page.search')}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="ps-9 dark:bg-slate-800 dark:border-slate-700"
          />
        </div>

        <Select value={statusFilter} onValueChange={onStatusFilterChange}>
          <SelectTrigger className="w-[150px] dark:bg-slate-800 dark:border-slate-700">
            <SelectValue placeholder={t('tasks_page.status_filter')} />
          </SelectTrigger>
          <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
            <SelectItem value="all" className="dark:text-slate-200">{t('tasks_page.all_statuses')}</SelectItem>
            <SelectItem value="pending" className="dark:text-slate-200">{t('tasks_page.status_pending')}</SelectItem>
            <SelectItem value="in_progress" className="dark:text-slate-200">{t('tasks_page.status_in_progress')}</SelectItem>
            <SelectItem value="awaiting_approval" className="dark:text-slate-200">{t('tasks_page.status_awaiting')}</SelectItem>
            <SelectItem value="completed" className="dark:text-slate-200">{t('tasks_page.status_completed')}</SelectItem>
            <SelectItem value="cancelled" className="dark:text-slate-200">{t('tasks_page.status_cancelled')}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={priorityFilter} onValueChange={onPriorityFilterChange}>
          <SelectTrigger className="w-[150px] dark:bg-slate-800 dark:border-slate-700">
            <SelectValue placeholder={t('tasks_page.priority_filter')} />
          </SelectTrigger>
          <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
            <SelectItem value="all" className="dark:text-slate-200">{t('tasks_page.all_priorities')}</SelectItem>
            <SelectItem value="low" className="dark:text-slate-200">{t('tasks_page.priority_low')}</SelectItem>
            <SelectItem value="medium" className="dark:text-slate-200">{t('tasks_page.priority_medium')}</SelectItem>
            <SelectItem value="high" className="dark:text-slate-200">{t('tasks_page.priority_high')}</SelectItem>
            <SelectItem value="critical" className="dark:text-slate-200">{t('tasks_page.priority_critical')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
