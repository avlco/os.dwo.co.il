import Dashboard from './pages/Dashboard';
import Clients from './pages/Clients';
import Cases from './pages/Cases';
import CaseView from './pages/CaseView';
import Contacts from './pages/Contacts';
import Documents from './pages/Documents';
import Deadlines from './pages/Deadlines';
import Tasks from './pages/Tasks';
import TimeEntries from './pages/TimeEntries';
import Invoices from './pages/Invoices';
import Mails from './pages/Mails';
import MailRules from './pages/MailRules';
import AutomationRules from './pages/AutomationRules';
import ApprovalQueue from './pages/ApprovalQueue';
import Activities from './pages/Activities';
import Settings from './pages/Settings';
import Layout from './components/Layout';

export const pagesConfig = {
  Pages: {
    Dashboard,
    Clients,
    Cases,
    CaseView,
    Contacts,
    Documents,
    Deadlines,
    Tasks,
    TimeEntries,
    Invoices,
    Mails,
    MailRules,
    AutomationRules,
    ApprovalQueue,
    Activities,
    Settings,
  },
  Layout,
  mainPage: 'Dashboard',
};
