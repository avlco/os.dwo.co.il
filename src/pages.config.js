import CaseView from './pages/CaseView';
import Cases from './pages/Cases';
import Clients from './pages/Clients';
import Dashboard from './pages/Dashboard';
import Docketing from './pages/Docketing';
import Financials from './pages/Financials';
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
    "Dashboard": Dashboard,
    "Docketing": Docketing,
    "Financials": Financials,
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