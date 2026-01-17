import Dashboard from './pages/Dashboard';
import Clients from './pages/Clients';
import Cases from './pages/Cases';
import CaseView from './pages/CaseView';
import Tasks from './pages/Tasks';
import Docketing from './pages/Docketing';
import Financials from './pages/Financials';
import MailRoom from './pages/MailRoom';
import MailView from './pages/MailView';
import MailAnalytics from './pages/MailAnalytics';
import Workbench from './pages/Workbench';
import ApprovalQueue from './pages/ApprovalQueue';
import Settings from './pages/Settings';
import Layout from './Layout';

export const pagesConfig = {
  Pages: {
    Dashboard,
    Clients,
    Cases,
    CaseView,
    Tasks,
    Docketing,
    Financials,
    MailRoom,
    MailView,
    MailAnalytics,
    Workbench,
    ApprovalQueue,
    Settings,
  },
  Layout,
  mainPage: 'Dashboard',
};
