import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext.jsx';
import { useLang } from './i18n/index.js';
import { Loading, LoadError } from './components/Loading.jsx';
import Login from './screens/Login.jsx';
import Home from './screens/Home.jsx';
import Levels from './screens/Levels.jsx';
import Lesson from './screens/Lesson.jsx';
import LessonDone from './screens/LessonDone.jsx';
import Practice from './screens/Practice.jsx';
import Profile from './screens/Profile.jsx';
import Family from './screens/Family.jsx';
import ListenCheck from './screens/ListenCheck.jsx';
import GradingRules from './screens/GradingRules.jsx';
import AdminProgress from './screens/AdminProgress.jsx';
import Settings from './screens/Settings.jsx';
import Admin from './screens/Admin.jsx';
import AdminUser from './screens/AdminUser.jsx';
import Voices from './screens/Voices.jsx';
import ForcePasswordChange from './screens/ForcePasswordChange.jsx';
import Corrections from './screens/Corrections.jsx';
import CorrectionEdit from './screens/CorrectionEdit.jsx';
import Inbox from './screens/Inbox.jsx';
import System from './screens/System.jsx';
import { AdminPreviewLesson, AdminPreviewPack } from './screens/AdminPreview.jsx';

/** role: only that role; learner: a child, or the admin in his own courses (the server checks the enrolment). */
function RequireUser({ role, learner = false, children }) {
  const { status, user, refresh, loggedOut } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <Loading />;
  if (status === 'error') return <LoadError onRetry={() => refresh().catch(() => {})} />;
  // Logged out by the server (the login expired): after logging in again, back to this page.
  if (!user) return <Navigate to="/login" replace state={loggedOut ? undefined : { from: location.pathname }} />;
  if (role && user.role !== role) return <Navigate to={user.role === 'admin' ? '/admin' : '/'} replace />;
  if (learner && user.role !== 'child' && user.role !== 'admin') return <Navigate to="/" replace />;
  // An admin with a seeded or admin-set password sees only the change-password form, on every page.
  if (user.role === 'admin' && user.mustChangePassword) return <ForcePasswordChange />;
  return children;
}

// /, /levels and /my-levels: one component for all three, so Home keeps its state (the path's scroll) when the level
// sheet opens and closes. A child: Home (/levels: with the level sheet open). The admin: /levels lists every track
// (with previews); his own Home and level sheet (/my-levels) when he takes a course — or wants to start one
// (/?start=1, from Admin's "Learn a language") — else / is the admin page.
function HomeRoute() {
  const { user } = useAuth();
  const location = useLocation();
  if (user.role !== 'admin') return location.pathname === '/my-levels' ? <Navigate to="/levels" replace /> : <Home />;
  if (location.pathname === '/levels') return <Levels />;
  if (!user.activeTrack && !new URLSearchParams(location.search).has('start')) return <Navigate to="/admin" replace />;
  return <Home />;
}

function LoginRoute() {
  const { status, user } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <Loading />;
  // After a login that interrupted something (the session ran out), back to where the user was.
  const from = location.state?.from;
  if (user) return <Navigate to={from && from !== '/login' ? from : user.role === 'admin' ? '/admin' : '/'} replace />;
  return <Login />;
}

export default function App() {
  // Re-render every screen when the interface language changes (Settings, login toggle, login).
  useLang();
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/" element={<RequireUser><HomeRoute /></RequireUser>} />
      <Route path="/levels" element={<RequireUser><HomeRoute /></RequireUser>} />
      <Route path="/my-levels" element={<RequireUser><HomeRoute /></RequireUser>} />
      <Route path="/lesson/:lessonId" element={<RequireUser learner><Lesson /></RequireUser>} />
      <Route path="/lesson/:lessonId/done" element={<RequireUser learner><LessonDone /></RequireUser>} />
      <Route path="/practice/done" element={<RequireUser learner><LessonDone /></RequireUser>} />
      <Route path="/practice/:mode" element={<RequireUser learner><Practice /></RequireUser>} />
      <Route path="/profile" element={<RequireUser learner><Profile /></RequireUser>} />
      <Route path="/settings" element={<RequireUser><Settings /></RequireUser>} />
      <Route path="/family" element={<RequireUser><Family /></RequireUser>} />
      <Route path="/admin" element={<RequireUser role="admin"><Admin /></RequireUser>} />
      <Route path="/admin/voices" element={<RequireUser role="admin"><Voices /></RequireUser>} />
      <Route path="/admin/corrections" element={<RequireUser role="admin"><Corrections /></RequireUser>} />
      <Route path="/admin/corrections/item/:id" element={<RequireUser role="admin"><CorrectionEdit /></RequireUser>} />
      <Route path="/admin/inbox" element={<RequireUser role="admin"><Inbox /></RequireUser>} />
      <Route path="/admin/system" element={<RequireUser role="admin"><System /></RequireUser>} />
      <Route path="/admin/listen" element={<RequireUser role="admin"><ListenCheck /></RequireUser>} />
      <Route path="/admin/rules" element={<RequireUser role="admin"><GradingRules /></RequireUser>} />
      <Route path="/admin/preview/:packId" element={<RequireUser role="admin"><AdminPreviewPack /></RequireUser>} />
      <Route path="/admin/preview/:packId/:lessonId" element={<RequireUser role="admin"><AdminPreviewLesson /></RequireUser>} />
      <Route path="/admin/users/new" element={<RequireUser role="admin"><AdminUser key="new" /></RequireUser>} />
      <Route path="/admin/users/:id" element={<RequireUser role="admin"><AdminUser key="edit" /></RequireUser>} />
      <Route path="/admin/users/:id/progress" element={<RequireUser role="admin"><AdminProgress /></RequireUser>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
