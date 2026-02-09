/**
 * DateTimePreferences Component
 * 
 * רכיב להגדרת העדפות תאריך ושעה במסך ההגדרות.
 * גלוי לכל המשתמשים להגדרת העדפותיהם האישיות.
 */

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useDateTimeSettings } from '../DateTimeSettingsProvider';
import { formatDate as fmtDate, formatTime as fmtTime } from '../utils/dateTimeUtils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Clock, Calendar, Globe, Loader2, Check } from 'lucide-react';

export default function DateTimePreferences() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'he';
  
  const { 
    settings, 
    updateSettings, 
    FORMAT_OPTIONS, 
    isLoading: contextLoading 
  } = useDateTimeSettings();

  const [localSettings, setLocalSettings] = useState({
    timezone: settings.timezone,
    dateFormat: settings.dateFormat,
    timeFormat: settings.timeFormat,
    datetimeFormat: settings.datetimeFormat
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // עדכון ההגדרות המקומיות כשההגדרות מהקונטקסט משתנות
  useEffect(() => {
    setLocalSettings({
      timezone: settings.timezone,
      dateFormat: settings.dateFormat,
      timeFormat: settings.timeFormat,
      datetimeFormat: settings.datetimeFormat
    });
  }, [settings]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await updateSettings(localSettings);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Error saving settings:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = 
    localSettings.timezone !== settings.timezone ||
    localSettings.dateFormat !== settings.dateFormat ||
    localSettings.timeFormat !== settings.timeFormat ||
    localSettings.datetimeFormat !== settings.datetimeFormat;

  // דוגמה לתאריך נוכחי לתצוגה מקדימה
  const previewDate = new Date();

  if (contextLoading) {
    return (
      <Card className="dark:bg-slate-800 dark:border-slate-700">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="dark:bg-slate-800 dark:border-slate-700">
      <CardHeader>
        <CardTitle className="dark:text-slate-100 flex items-center gap-2">
          <Clock className="w-5 h-5" />
          {t('settings.datetime_preferences', 'העדפות תאריך ושעה')}
        </CardTitle>
        <CardDescription className="dark:text-slate-400">
          {t('settings.datetime_preferences_desc', 'הגדר את פורמט התצוגה של תאריכים וזמנים במערכת')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* אזור זמן */}
        <div className="space-y-2">
          <Label className="dark:text-slate-300 flex items-center gap-2">
            <Globe className="w-4 h-4" />
            {t('settings.timezone', 'אזור זמן')}
          </Label>
          <Select 
            value={localSettings.timezone}
            onValueChange={(v) => setLocalSettings({ ...localSettings, timezone: v })}
          >
            <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600 dark:text-slate-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
              {FORMAT_OPTIONS.timezones.map(tz => (
                <SelectItem key={tz.value} value={tz.value} className="dark:text-slate-200">
                  {isRTL ? tz.label : tz.labelEn}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* פורמט תאריך */}
        <div className="space-y-2">
          <Label className="dark:text-slate-300 flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            {t('settings.date_format', 'פורמט תאריך')}
          </Label>
          <Select 
            value={localSettings.dateFormat}
            onValueChange={(v) => setLocalSettings({ ...localSettings, dateFormat: v })}
          >
            <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600 dark:text-slate-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
              {FORMAT_OPTIONS.dateFormats.map(fmt => (
                <SelectItem key={fmt.value} value={fmt.value} className="dark:text-slate-200">
                  {isRTL ? fmt.label : fmt.labelEn}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* פורמט שעה */}
        <div className="space-y-2">
          <Label className="dark:text-slate-300 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            {t('settings.time_format', 'פורמט שעה')}
          </Label>
          <Select 
            value={localSettings.timeFormat}
            onValueChange={(v) => setLocalSettings({ ...localSettings, timeFormat: v })}
          >
            <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600 dark:text-slate-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
              {FORMAT_OPTIONS.timeFormats.map(fmt => (
                <SelectItem key={fmt.value} value={fmt.value} className="dark:text-slate-200">
                  {isRTL ? fmt.label : fmt.labelEn}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* פורמט תאריך ושעה משולב */}
        <div className="space-y-2">
          <Label className="dark:text-slate-300">
            {t('settings.datetime_format', 'פורמט תאריך ושעה')}
          </Label>
          <Select 
            value={localSettings.datetimeFormat}
            onValueChange={(v) => setLocalSettings({ ...localSettings, datetimeFormat: v })}
          >
            <SelectTrigger className="dark:bg-slate-900 dark:border-slate-600 dark:text-slate-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
              {FORMAT_OPTIONS.datetimeFormats.map(fmt => (
                <SelectItem key={fmt.value} value={fmt.value} className="dark:text-slate-200">
                  {isRTL ? fmt.label : fmt.labelEn}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* תצוגה מקדימה */}
        <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
            {t('settings.preview', 'תצוגה מקדימה')}:
          </p>
          <div className="space-y-1 text-sm dark:text-slate-200">
            <p><span className="text-slate-500">{t('settings.date', 'תאריך')}:</span> {fmtDate(previewDate, { ...localSettings, language: i18n.language })}</p>
            <p><span className="text-slate-500">{t('settings.time', 'שעה')}:</span> {fmtTime(previewDate, { ...localSettings, language: i18n.language })}</p>
          </div>
        </div>

        {/* כפתור שמירה */}
        <div className="flex justify-end">
          <Button 
            onClick={handleSave} 
            disabled={isSaving || !hasChanges}
            className="bg-slate-800 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 gap-2"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('common.saving', 'שומר...')}
              </>
            ) : saveSuccess ? (
              <>
                <Check className="w-4 h-4" />
                {t('common.saved', 'נשמר!')}
              </>
            ) : (
              t('common.save_changes', 'שמור שינויים')
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}