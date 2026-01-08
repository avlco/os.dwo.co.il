import CaseView from './pages/CaseView';
import Cases from './pages/Cases';
import Clients from './pages/Clients';
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
    "CaseView": CaseView,
    "Cases": Cases,
    "Clients": Clients,
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
    mainPage: "CaseView",
    Pages: PAGES,
    Layout: __Layout,
};