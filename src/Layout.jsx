import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from './utils';
import { useTranslation } from 'react-i18next';
import { ThemeProvider } from './components/ThemeProvider';
import { DateTimeSettingsProvider } from './components/DateTimeSettingsProvider';
import './components/i18nConfig';
import { useAuth } from '@/lib/AuthContext';
import {
  LayoutDashboard,
  Briefcase,
  Users,
  Calendar,
  FileText,
  Receipt,
  Settings,
  LogOut,
  Menu,
  X,
  Search,
  ChevronDown,
  Mail,
  PanelLeftClose,
  PanelLeftOpen,
  Loader2,
  BarChart3
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

function LayoutContent({ children, currentPageName }) {
  const { t, i18n } = useTranslation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  const { user, isLoading, isAuthenticated, logout, navigateToLogin } = useAuth();
  
  const isRTL = i18n.language === 'he';

  const navigation = [
    { name: t('nav.dashboard'), href: 'Dashboard', icon: LayoutDashboard },
    { name: t('nav.mail_room'), href: 'MailRoom', icon: Mail },
    { name: t('nav.cases'), href: 'Cases', icon: Briefcase },
    { name: t('nav.clients'), href: 'Clients', icon: Users },
    { name: t('nav.docketing'), href: 'Docketing', icon: Calendar },
    { name: t('nav.tasks'), href: 'Tasks', icon: FileText },
    { name: t('nav.financials'), href: 'Financials', icon: Receipt },
    { name: t('nav.analytics'), href: 'MailAnalytics', icon: BarChart3 },
    { name: t('nav.settings'), href: 'Settings', icon: Settings },
  ];

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigateToLogin();
    }
  }, [isLoading, isAuthenticated, navigateToLogin]);

  const getInitials = (name) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-800 dark:text-slate-200" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed top-0 h-full bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 z-50 transform transition-all duration-300 ease-out lg:translate-x-0",
        isRTL ? "right-0 border-l" : "left-0 border-r",
        sidebarCollapsed ? "w-20" : "w-72",
        sidebarOpen ? "translate-x-0" : (isRTL ? "translate-x-full" : "-translate-x-full")
      )}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className={`flex items-center justify-between h-16 ${sidebarCollapsed ? 'px-4' : 'px-6'} border-b border-slate-100 dark:border-slate-700`}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-800 to-slate-600 dark:from-slate-700 dark:to-slate-500 flex items-center justify-center flex-shrink-0">
                <Briefcase className="w-5 h-5 text-white" />
              </div>
              {!sidebarCollapsed && (
                <span className="text-lg font-bold text-slate-800 dark:text-slate-100">{t('app_name')}</span>
              )}
            </div>
            <button 
              className="lg:hidden p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
              onClick={() => setSidebarOpen(false)}
              aria-label={t('common.close_sidebar')}
            >
              <X className="w-5 h-5 text-slate-500 dark:text-slate-400" />
            </button>
          </div>

          {/* Navigation */}
          <nav className={`flex-1 py-6 ${sidebarCollapsed ? 'px-2' : 'px-4'} space-y-1 overflow-y-auto`}>
            {navigation.map((item) => {
              const isActive = currentPageName === item.href;
              return (
                <Link
                  key={item.href}
                  to={createPageUrl(item.href)}
                  onClick={() => setSidebarOpen(false)}
                  title={sidebarCollapsed ? item.name : ''}
                  className={`
                    flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3'} ${sidebarCollapsed ? 'px-2' : 'px-4'} py-3 rounded-xl text-sm font-medium
                    transition-all duration-200
                    ${isActive 
                      ? 'bg-slate-800 dark:bg-slate-700 text-white shadow-sm' 
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-slate-100'
                    }
                  `}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  {!sidebarCollapsed && item.name}
                </Link>
              );
            })}
          </nav>

          {/* User section */}
          {user && (
            <div className={`${sidebarCollapsed ? 'p-2' : 'p-4'} border-t border-slate-100 dark:border-slate-700`}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center p-2' : 'gap-3 p-3'} rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors`}>
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-medium">
                        {getInitials(user.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    {!sidebarCollapsed && (
                      <>
                        <div className={`flex-1 ${isRTL ? 'text-right' : 'text-left'}`}>
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{user.full_name}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
                        </div>
                        <ChevronDown className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                      </>
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 dark:bg-slate-800 dark:border-slate-700">
                  <DropdownMenuItem asChild>
                    <Link to={createPageUrl('Settings')} className="cursor-pointer dark:text-slate-200 dark:hover:bg-slate-700">
                      <Settings className={`w-4 h-4 ${isRTL ? 'ml-2' : 'mr-2'}`} />
                      {t('nav.settings')}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="dark:bg-slate-700" />
                  <DropdownMenuItem onClick={logout} className="text-rose-600 dark:text-rose-400 cursor-pointer dark:hover:bg-slate-700">
                    <LogOut className={`w-4 h-4 ${isRTL ? 'ml-2' : 'mr-2'}`} />
                    {t('nav.logout')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className={cn(
        "transition-all duration-300",
        isRTL 
          ? (sidebarCollapsed ? "lg:mr-20" : "lg:mr-72")
          : (sidebarCollapsed ? "lg:ml-20" : "lg:ml-72")
      )}>
        {/* Top header */}
        <header className="sticky top-0 z-30 bg-white/80 dark:bg-slate-800/80 backdrop-blur-lg border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between h-16 px-6">
            <div className="flex items-center gap-4">
              <button 
                className="lg:hidden p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                onClick={() => setSidebarOpen(true)}
                aria-label={t('common.open_sidebar')}
              >
                <Menu className="w-5 h-5 text-slate-600 dark:text-slate-300" />
              </button>
              <button 
                className="hidden lg:flex p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                aria-label={sidebarCollapsed ? t('common.expand_sidebar') : t('common.collapse_sidebar')}
              >
                {sidebarCollapsed ? (
                  <PanelLeftOpen className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                ) : (
                  <PanelLeftClose className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                )}
              </button>
              <div className="relative hidden md:block">
                <Search className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400`} />
                <Input 
                  placeholder={t('common.search')}
                  className={`w-80 ${isRTL ? 'pr-10' : 'pl-10'} bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-700 dark:text-slate-200`}
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

export default function Layout({ children, currentPageName }) {
  return (
    <ThemeProvider>
      <DateTimeSettingsProvider>
        <LayoutContent children={children} currentPageName={currentPageName} />
      </DateTimeSettingsProvider>
    </ThemeProvider>
  );
}