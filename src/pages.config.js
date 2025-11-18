import Dashboard from './pages/Dashboard';
import Jobs from './pages/Jobs';
import QueryRunner from './pages/QueryRunner';
import Login from './pages/Login';
import LoginFailed from './pages/LoginFailed';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Dashboard": Dashboard,
    "Jobs": Jobs,
    "QueryRunner": QueryRunner,
    "login": Login,
    "login-failed": LoginFailed,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};