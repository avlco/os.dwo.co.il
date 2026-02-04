/**
 * DateTimeSettingsProvider
 * 
 * קונטקסט גלובלי לניהול הגדרות תאריך/שעה במערכת.
 * מספק גישה נוחה להגדרות המשתמש ולפונקציות פורמט.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { base44 } from '@/api/base44Client';
import {
  DEFAULT_SETTINGS,
  FORMAT_OPTIONS,
  getDateTimeSettings,
  getLocale,
  formatDate,
  formatTime,
  formatDateTime,
  formatCalendar,
  formatForDateInput,
  formatForDateTimeInput
} from '../utils/dateTimeUtils';

const DateTimeSettingsContext = createContext({
  settings: DEFAULT_SETTINGS,
  user: null,
  isLoading: true,
  updateSettings: async () => {},
  formatDate: () => '-',
  formatTime: () => '-',
  formatDateTime: () => '-',
  formatCalendar: () => '-',
  formatForDateInput: () => '',
  formatForDateTimeInput: () => '',
  FORMAT_OPTIONS,
  DEFAULT_SETTINGS
});

export const useDateTimeSettings = () => useContext(DateTimeSettingsContext);

export function DateTimeSettingsProvider({ children }) {
  const { i18n } = useTranslation();
  const [user, setUser] = useState(null);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  // טעינת נתוני המשתמש והגדרותיו
  useEffect(() => {
    const loadUserSettings = async () => {
      try {
        const userData = await base44.auth.me();
        setUser(userData);
        
        const userSettings = getDateTimeSettings(userData, i18n.language);
        setSettings(userSettings);
      } catch (error) {
        console.log('User not authenticated, using default settings');
        setSettings(getDateTimeSettings(null, i18n.language));
      } finally {
        setIsLoading(false);
      }
    };

    loadUserSettings();
  }, [i18n.language]);

  // עדכון הגדרות כשהשפה משתנה
  useEffect(() => {
    setSettings(prev => ({
      ...prev,
      language: i18n.language
    }));
  }, [i18n.language]);

  // עדכון הגדרות התאריך/שעה של המשתמש
  const updateSettings = useCallback(async (newSettings) => {
    try {
      // עדכון הגדרות המשתמש בשרת
      await base44.auth.updateMe({
        preferred_timezone: newSettings.timezone,
        preferred_date_format: newSettings.dateFormat,
        preferred_time_format: newSettings.timeFormat,
        preferred_datetime_format: newSettings.datetimeFormat
      });

      // עדכון מקומי
      setSettings(prev => ({
        ...prev,
        ...newSettings
      }));

      // עדכון אובייקט המשתמש
      setUser(prev => prev ? {
        ...prev,
        preferred_timezone: newSettings.timezone,
        preferred_date_format: newSettings.dateFormat,
        preferred_time_format: newSettings.timeFormat,
        preferred_datetime_format: newSettings.datetimeFormat
      } : null);

      return true;
    } catch (error) {
      console.error('Error updating date/time settings:', error);
      throw error;
    }
  }, []);

  // פונקציות פורמט מעטפות שמשתמשות בהגדרות הנוכחיות
  const wrappedFormatDate = useCallback((date, customFormat = null) => {
    return formatDate(date, settings, customFormat);
  }, [settings]);

  const wrappedFormatTime = useCallback((date, customFormat = null) => {
    return formatTime(date, settings, customFormat);
  }, [settings]);

  const wrappedFormatDateTime = useCallback((date, customFormat = null) => {
    return formatDateTime(date, settings, customFormat);
  }, [settings]);

  const wrappedFormatCalendar = useCallback((date, formatStr) => {
    return formatCalendar(date, formatStr, settings);
  }, [settings]);

  const value = {
    settings,
    user,
    isLoading,
    updateSettings,
    formatDate: wrappedFormatDate,
    formatTime: wrappedFormatTime,
    formatDateTime: wrappedFormatDateTime,
    formatCalendar: wrappedFormatCalendar,
    formatForDateInput,
    formatForDateTimeInput,
    FORMAT_OPTIONS,
    DEFAULT_SETTINGS,
    getLocale: () => getLocale(settings.language)
  };

  return (
    <DateTimeSettingsContext.Provider value={value}>
      {children}
    </DateTimeSettingsContext.Provider>
  );
}

export default DateTimeSettingsProvider;