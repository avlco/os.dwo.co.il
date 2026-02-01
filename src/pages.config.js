/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import ApprovalBatchEdit from './pages/ApprovalBatchEdit';
import ApprovalQueue from './pages/ApprovalQueue';
import ApproveBatch from './pages/ApproveBatch';
import AutomationDebugger from './pages/AutomationDebugger';
import AutomationMetrics from './pages/AutomationMetrics';
import AutomationRules from './pages/AutomationRules';
import CaseView from './pages/CaseView';
import Cases from './pages/Cases';
import ClientView from './pages/ClientView';
import Clients from './pages/Clients';
import Dashboard from './pages/Dashboard';
import Docketing from './pages/Docketing';
import Financials from './pages/Financials';
import MailAnalytics from './pages/MailAnalytics';
import MailRoom from './pages/MailRoom';
import MailView from './pages/MailView';
import Settings from './pages/Settings';
import Tasks from './pages/Tasks';
import Workbench from './pages/Workbench';
import __Layout from './Layout.jsx';


export const PAGES = {
    "ApprovalBatchEdit": ApprovalBatchEdit,
    "ApprovalQueue": ApprovalQueue,
    "ApproveBatch": ApproveBatch,
    "AutomationDebugger": AutomationDebugger,
    "AutomationMetrics": AutomationMetrics,
    "AutomationRules": AutomationRules,
    "CaseView": CaseView,
    "Cases": Cases,
    "ClientView": ClientView,
    "Clients": Clients,
    "Dashboard": Dashboard,
    "Docketing": Docketing,
    "Financials": Financials,
    "MailAnalytics": MailAnalytics,
    "MailRoom": MailRoom,
    "MailView": MailView,
    "Settings": Settings,
    "Tasks": Tasks,
    "Workbench": Workbench,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};