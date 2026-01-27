import ApproveBatch from './pages/ApproveBatch';
import ApprovalBatchEdit from './pages/ApprovalBatchEdit';
import ApprovalQueue from './pages/ApprovalQueue';
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
    "ApproveBatch": ApproveBatch,
    "ApprovalBatchEdit": ApprovalBatchEdit,
    "ApprovalQueue": ApprovalQueue,
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