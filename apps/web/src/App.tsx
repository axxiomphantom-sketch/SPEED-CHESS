import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout, ProtectedLayout } from './components/Layout';
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Onboarding } from './pages/Onboarding';
import { Dashboard } from './pages/Dashboard';
import { NotFound } from './pages/NotFound';

const Play = lazy(() => import('./pages/Play').then(m => ({ default: m.Play })));
const GameRoom = lazy(() => import('./pages/GameRoom').then(m => ({ default: m.GameRoom })));
const HowToPlay = lazy(() => import('./pages/HowToPlay').then(m => ({ default: m.HowToPlay })));
const Learn = lazy(() => import('./pages/Learn').then(m => ({ default: m.Learn })));
const LessonView = lazy(() => import('./pages/LessonView').then(m => ({ default: m.LessonView })));
const Training = lazy(() => import('./pages/Training').then(m => ({ default: m.Training })));
const Openings = lazy(() => import('./pages/Openings').then(m => ({ default: m.Openings })));
const Analysis = lazy(() => import('./pages/Analysis').then(m => ({ default: m.Analysis })));
const History = lazy(() => import('./pages/History').then(m => ({ default: m.History })));
const Tournaments = lazy(() => import('./pages/Tournaments').then(m => ({ default: m.Tournaments })));
const TournamentDetail = lazy(() => import('./pages/TournamentDetail').then(m => ({ default: m.TournamentDetail })));
const Leaderboards = lazy(() => import('./pages/Leaderboards').then(m => ({ default: m.Leaderboards })));
const Friends = lazy(() => import('./pages/Friends').then(m => ({ default: m.Friends })));
const Messages = lazy(() => import('./pages/Messages').then(m => ({ default: m.Messages })));
const Clubs = lazy(() => import('./pages/Clubs').then(m => ({ default: m.Clubs })));
const ClubDetail = lazy(() => import('./pages/ClubDetail').then(m => ({ default: m.ClubDetail })));
const Coach = lazy(() => import('./pages/Coach').then(m => ({ default: m.Coach })));
const Coaching = lazy(() => import('./pages/Coaching').then(m => ({ default: m.Coaching })));
const Content = lazy(() => import('./pages/Content').then(m => ({ default: m.Content })));
const ArticleView = lazy(() => import('./pages/ArticleView').then(m => ({ default: m.ArticleView })));
const Achievements = lazy(() => import('./pages/Achievements').then(m => ({ default: m.Achievements })));
const Profile = lazy(() => import('./pages/Profile').then(m => ({ default: m.Profile })));
const PlayerProfile = lazy(() => import('./pages/PlayerProfile').then(m => ({ default: m.PlayerProfile })));
const Analytics = lazy(() => import('./pages/Analytics').then(m => ({ default: m.Analytics })));
const Notifications = lazy(() => import('./pages/Notifications').then(m => ({ default: m.Notifications })));
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));
const Pricing = lazy(() => import('./pages/Pricing').then(m => ({ default: m.Pricing })));
const Help = lazy(() => import('./pages/Help').then(m => ({ default: m.Help })));
const Admin = lazy(() => import('./pages/Admin').then(m => ({ default: m.Admin })));
const Legal = lazy(() => import('./pages/Legal').then(m => ({ default: m.Legal })));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail').then(m => ({ default: m.VerifyEmail })));
const AuthCallback = lazy(() => import('./pages/AuthCallback').then(m => ({ default: m.AuthCallback })));
const ResetPassword = lazy(() => import('./pages/ResetPassword').then(m => ({ default: m.ResetPassword })));

function PageFallback() {
  return (
    <div className="page">
      <div className="skeleton" style={{ height: 40, width: 220, marginBottom: 20 }} />
      <div className="grid grid-3">
        {[0, 1, 2].map(i => <div key={i} className="skeleton" style={{ height: 150 }} />)}
      </div>
    </div>
  );
}

export function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/legal/:doc" element={<Legal />} />

        <Route element={<ProtectedLayout />}>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/play" element={<Play />} />
            <Route path="/play/game/:id" element={<GameRoom />} />
            <Route path="/how-to-play" element={<HowToPlay />} />
            <Route path="/learn" element={<Learn />} />
            <Route path="/learn/lesson/:slug" element={<LessonView />} />
            <Route path="/training" element={<Training />} />
            <Route path="/openings" element={<Openings />} />
            <Route path="/openings/:id" element={<Openings />} />
            <Route path="/analysis" element={<Analysis />} />
            <Route path="/analysis/:gameId" element={<Analysis />} />
            <Route path="/games/:gameId" element={<Analysis />} />
            <Route path="/history" element={<History />} />
            <Route path="/tournaments" element={<Tournaments />} />
            <Route path="/tournaments/:slug" element={<TournamentDetail />} />
            <Route path="/leaderboards" element={<Leaderboards />} />
            <Route path="/friends" element={<Friends />} />
            <Route path="/messages" element={<Messages />} />
            <Route path="/messages/:username" element={<Messages />} />
            <Route path="/clubs" element={<Clubs />} />
            <Route path="/clubs/:slug" element={<ClubDetail />} />
            <Route path="/coach" element={<Coach />} />
            <Route path="/coaching" element={<Coaching />} />
            <Route path="/content" element={<Content />} />
            <Route path="/content/:slug" element={<ArticleView />} />
            <Route path="/achievements" element={<Achievements />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/players/:username" element={<PlayerProfile />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/help" element={<Help />} />
            <Route path="/admin" element={<Admin />} />
          </Route>
        </Route>

        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/404" element={<NotFound />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Routes>
    </Suspense>
  );
}
