import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useTranslation } from 'react-i18next';
import {
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Check,
  Mail,
  Clock,
  Calendar,
  FileText,
  Cloud
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

// Pre-defined templates for common email sources
const ruleTemplates = {
  ilpo: {
    name: { he: 'רשם הפטנטים הישראלי', en: 'Israel Patent Office' },
    description: { he: 'מיילים מרשם הפטנטים הישראלי', en: 'Emails from Israel Patent Office' },
    catch_config: {
      sender_pattern: '.*@ilpo\\.gov\\.il',
      subject_regex: '(?:מס[\'׳]?|No\\.?)\\s*(\\d{6,})',
      body_keywords: ['דו"ח בחינה', 'office action', 'החלטה'],
    },
  },
  uspto: {
    name: { he: 'USPTO', en: 'USPTO' },
    description: { he: 'מיילים ממשרד הפטנטים האמריקאי', en: 'Emails from US Patent Office' },
    catch_config: {
      sender_pattern: '.*@uspto\\.gov',
      subject_regex: '(?:Application|App\\.?)\\s*(?:No\\.?)?\\s*(\\d{2}\\/\\d{3},?\\d{3})',
      body_keywords: ['office action', 'non-final', 'final rejection'],
    },
  },
  epo: {
    name: { he: 'EPO', en: 'EPO' },
    description: { he: 'מיילים ממשרד הפטנטים האירופי', en: 'Emails from European Patent Office' },
    catch_config: {
      sender_pattern: '.*@epo\\.org',
      subject_regex: '(?:EP)?\\s*(\\d{7,})',
      body_keywords: ['examination report', 'communication', 'Rule 71(3)'],
    },
  },
  custom: {
    name: { he: 'חוק מותאם אישית', en: 'Custom Rule' },
    description: { he: 'יצירת חוק מותאם אישית', en: 'Create a custom rule' },
    catch_config: {
      sender_pattern: '',
      subject_regex: '',
      body_keywords: [],
    },
  },
};

const actionTemplates = [
  { 
    type: 'log_time', 
    label: { he: 'רישום שעות', en: 'Log Time' },
    icon: Clock,
    defaultConfig: { hours: 0.5 }
  },
  { 
    type: 'create_deadline', 
    label: { he: 'יצירת מועד', en: 'Create Deadline' },
    icon: Calendar,
    defaultConfig: { days_offset: 30, deadline_type: 'office_action_response' }
  },
  { 
    type: 'upload_to_dropbox', 
    label: { he: 'העלאה ל-Dropbox', en: 'Upload to Dropbox' },
    icon: Cloud,
    defaultConfig: { dropbox_folder_path: '/Cases/{{case_number}}' }
  },
  { 
    type: 'create_calendar_event', 
    label: { he: 'יצירת אירוע יומן', en: 'Create Calendar Event' },
    icon: Calendar,
    defaultConfig: { 
      calendar_event_template: { 
        title_template: 'מועד: {{case_number}}',
        description_template: 'מייל מקורי: {{mail_subject}}'
      }
    }
  },
];

export default function RuleOnboardingWizard({ onClose, onRuleCreated }) {
  const { i18n } = useTranslation();
  const isRTL = i18n.language === 'he';
  const lang = isRTL ? 'he' : 'en';
  const queryClient = useQueryClient();

  const [step, setStep] = useState(1);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [ruleName, setRuleName] = useState('');
  const [selectedActions, setSelectedActions] = useState([]);

  const createRuleMutation = useMutation({
    mutationFn: (data) => base44.entities.MailRule.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['mailRules']);
      onRuleCreated?.();
      onClose?.();
    },
  });

  const handleTemplateSelect = (templateKey) => {
    setSelectedTemplate(templateKey);
    const template = ruleTemplates[templateKey];
    setRuleName(template.name[lang]);
  };

  const toggleAction = (actionType) => {
    setSelectedActions(prev => 
      prev.includes(actionType)
        ? prev.filter(a => a !== actionType)
        : [...prev, actionType]
    );
  };

  const handleCreate = () => {
    const template = ruleTemplates[selectedTemplate];
    const despatchConfig = selectedActions.map(actionType => {
      const actionTemplate = actionTemplates.find(a => a.type === actionType);
      return {
        action_type: actionType,
        action_label: actionTemplate.label[lang],
        ...actionTemplate.defaultConfig,
      };
    });

    createRuleMutation.mutate({
      name: ruleName,
      description: template.description[lang],
      is_active: true,
      priority: 10,
      catch_config: template.catch_config,
      despatch_config: despatchConfig,
      approval_required: true,
      auto_link_case: true,
    });
  };

  const NextIcon = isRTL ? ChevronLeft : ChevronRight;
  const PrevIcon = isRTL ? ChevronRight : ChevronLeft;

  return (
    <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-900 border-blue-200 dark:border-slate-700">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <CardTitle className="dark:text-slate-200">
              {isRTL ? 'אשף הגדרת חוקים' : 'Rule Setup Wizard'}
            </CardTitle>
            <CardDescription className="dark:text-slate-400">
              {isRTL ? `שלב ${step} מתוך 3` : `Step ${step} of 3`}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Step 1: Select Template */}
        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              {isRTL ? 'בחר את סוג המיילים שברצונך לעבד אוטומטית:' : 'Select the type of emails you want to process automatically:'}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Object.entries(ruleTemplates).map(([key, template]) => (
                <button
                  key={key}
                  onClick={() => handleTemplateSelect(key)}
                  className={`p-4 rounded-xl border-2 text-${isRTL ? 'right' : 'left'} transition-all ${
                    selectedTemplate === key
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                      : 'border-slate-200 dark:border-slate-600 hover:border-blue-300 bg-white dark:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Mail className="w-4 h-4 text-slate-500" />
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {template.name[lang]}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {template.description[lang]}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Configure Name */}
        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              {isRTL ? 'בדוק את שם החוק והגדרות הזיהוי:' : 'Review the rule name and detection settings:'}
            </p>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="dark:text-slate-300">{isRTL ? 'שם החוק' : 'Rule Name'}</Label>
                <Input
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  className="dark:bg-slate-800 dark:border-slate-600"
                />
              </div>
              
              {selectedTemplate && ruleTemplates[selectedTemplate] && (
                <div className="p-4 bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700">
                  <h4 className="font-medium text-sm text-slate-700 dark:text-slate-300 mb-3">
                    {isRTL ? 'תנאי זיהוי (מוגדרים מראש)' : 'Detection Conditions (Pre-configured)'}
                  </h4>
                  <div className="space-y-2 text-sm">
                    {ruleTemplates[selectedTemplate].catch_config.sender_pattern && (
                      <div className="flex gap-2">
                        <Badge variant="outline" className="text-xs">{isRTL ? 'שולח' : 'Sender'}</Badge>
                        <code className="text-xs text-slate-600 dark:text-slate-400">
                          {ruleTemplates[selectedTemplate].catch_config.sender_pattern}
                        </code>
                      </div>
                    )}
                    {ruleTemplates[selectedTemplate].catch_config.subject_regex && (
                      <div className="flex gap-2">
                        <Badge variant="outline" className="text-xs">{isRTL ? 'נושא' : 'Subject'}</Badge>
                        <code className="text-xs text-slate-600 dark:text-slate-400">
                          {ruleTemplates[selectedTemplate].catch_config.subject_regex}
                        </code>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Select Actions */}
        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              {isRTL ? 'בחר את הפעולות שיבוצעו כשמייל מתאים יזוהה:' : 'Select the actions to perform when a matching email is detected:'}
            </p>
            <div className="space-y-3">
              {actionTemplates.map((action) => {
                const Icon = action.icon;
                const isSelected = selectedActions.includes(action.type);
                return (
                  <button
                    key={action.type}
                    onClick={() => toggleAction(action.type)}
                    className={`w-full p-4 rounded-xl border-2 text-${isRTL ? 'right' : 'left'} transition-all flex items-center gap-3 ${
                      isSelected
                        ? 'border-green-500 bg-green-50 dark:bg-green-900/30'
                        : 'border-slate-200 dark:border-slate-600 hover:border-green-300 bg-white dark:bg-slate-800'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      isSelected ? 'bg-green-100 dark:bg-green-900/50' : 'bg-slate-100 dark:bg-slate-700'
                    }`}>
                      <Icon className={`w-4 h-4 ${isSelected ? 'text-green-600' : 'text-slate-500'}`} />
                    </div>
                    <span className="flex-1 font-medium text-slate-800 dark:text-slate-200">
                      {action.label[lang]}
                    </span>
                    {isSelected && <Check className="w-5 h-5 text-green-600" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6 pt-4 border-t dark:border-slate-700">
          <Button
            variant="outline"
            onClick={() => step === 1 ? onClose?.() : setStep(step - 1)}
            className="gap-2 dark:border-slate-600"
          >
            <PrevIcon className="w-4 h-4" />
            {step === 1 ? (isRTL ? 'סגור' : 'Close') : (isRTL ? 'הקודם' : 'Previous')}
          </Button>
          
          {step < 3 ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={step === 1 && !selectedTemplate}
              className="gap-2 bg-blue-600 hover:bg-blue-700"
            >
              {isRTL ? 'הבא' : 'Next'}
              <NextIcon className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              onClick={handleCreate}
              disabled={selectedActions.length === 0 || createRuleMutation.isPending}
              className="gap-2 bg-green-600 hover:bg-green-700"
            >
              <Check className="w-4 h-4" />
              {isRTL ? 'צור חוק' : 'Create Rule'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}