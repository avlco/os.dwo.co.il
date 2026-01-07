import Dashboard from './pages/Dashboard';
import Cases from './pages/Cases';
import CaseView from './pages/CaseView';
import Clients from './pages/Clients';
import Tasks from './pages/Tasks';
import Docketing from './pages/Docketing';
import Financials from './pages/Financials';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Dashboard": Dashboard,
    "Cases": Cases,
    "CaseView": CaseView,
    "Clients": Clients,
    "Tasks": Tasks,
    "Docketing": Docketing,
    "Financials": Financials,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};