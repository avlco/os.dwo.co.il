import Dashboard from './pages/Dashboard';
import Cases from './pages/Cases';
import CaseView from './pages/CaseView';
import Clients from './pages/Clients';
import Tasks from './pages/Tasks';
import Docketing from './pages/Docketing';
import Financials from './pages/Financials';
import MailRoom from './pages/MailRoom';
import Workbench from './pages/Workbench';
import MailView from './pages/MailView';
import Settings from './pages/Settings';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Dashboard": Dashboard,
    "Cases": Cases,
    "CaseView": CaseView,
    "Clients": Clients,
    "Tasks": Tasks,
    "Docketing": Docketing,
    "Financials": Financials,
    "MailRoom": MailRoom,
    "Workbench": Workbench,
    "MailView": MailView,
    "Settings": Settings,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};