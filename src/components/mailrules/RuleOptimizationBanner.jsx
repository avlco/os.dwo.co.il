import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Lightbulb, ChevronRight } from 'lucide-react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function RuleOptimizationBanner({ onEditRule }) {
  const { i18n } = useTranslation();
  const isRTL = i18n.language === 'he';

  const { data: suggestions, isLoading } = useQuery({
    queryKey: ['rule-optimization-suggestions'],
    queryFn: async () => {
      const result = await base44.functions.invoke('getRuleOptimizationSuggestions', {});
      return result.data;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
    retry: false,
  });

  if (isLoading || !suggestions?.suggestions?.length) {
    return null;
  }

  return (
    <Card className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 mb-6">
      <CardContent className="pt-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center flex-shrink-0">
            <Lightbulb className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1">
            <h3 className="font-medium text-amber-800 dark:text-amber-300 mb-1">
              {isRTL ? 'הצעות לשיפור חוקים' : 'Rule Optimization Suggestions'}
            </h3>
            <p className="text-sm text-amber-700 dark:text-amber-400 mb-3">
              {isRTL 
                ? `זוהו ${suggestions.suggestions.length} דפוסים שעשויים להצביע על צורך בעדכון חוקים`
                : `Found ${suggestions.suggestions.length} patterns that may indicate rules need updating`}
            </p>
            
            <div className="space-y-2">
              {suggestions.suggestions.slice(0, 3).map((suggestion, index) => (
                <div 
                  key={index}
                  className="flex items-center justify-between p-2 bg-white dark:bg-slate-800 rounded-lg border border-amber-200 dark:border-amber-700"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {suggestion.override_count}x
                    </Badge>
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                      {suggestion.rule_name}
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                      {suggestion.suggested_case_number}
                    </span>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => onEditRule && onEditRule(suggestion.rule_id)}
                    className="text-amber-700 hover:text-amber-800 dark:text-amber-400"
                  >
                    {isRTL ? 'עדכן' : 'Update'}
                  </Button>
                </div>
              ))}
            </div>

            {suggestions.stats && (
              <div className="mt-3 pt-3 border-t border-amber-200 dark:border-amber-700">
                <p className="text-xs text-amber-600 dark:text-amber-500">
                  {isRTL 
                    ? `שיעור שינויים ידניים: ${suggestions.stats.override_rate}% (${suggestions.stats.total_overrides} מתוך ${suggestions.stats.total_tasks})`
                    : `Manual override rate: ${suggestions.stats.override_rate}% (${suggestions.stats.total_overrides} of ${suggestions.stats.total_tasks})`}
                </p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}