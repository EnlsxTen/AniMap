import React from 'react';
import { BrowserRouter, HashRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import MerchantCenter from './pages/MerchantCenter';
import CreateEvent from './pages/CreateEvent';
import EditEvent from './pages/EditEvent';
import CreateVenue from './pages/CreateVenue';
import EditVenue from './pages/EditVenue';
import VenueDetail from './pages/VenueDetail';
import CreateSession from './pages/CreateSession';
import EditSession from './pages/EditSession';
import Favorites from './pages/Favorites';
import Profile from './pages/Profile';
import MyComments from './pages/MyComments';
import AdminMerchantReviews from './pages/AdminMerchantReviews';
import AdminSettings from './pages/AdminSettings';
import AdminUsers from './pages/AdminUsers';
import NotFound from './pages/NotFound';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import AnalyticsTracker from './components/AnalyticsTracker';
import ErrorBoundary from './components/ErrorBoundary';
import ProtectedRoute from './components/ProtectedRoute';
import { ThemeProvider } from './contexts/ThemeContext';
import { PerfModeProvider, usePerfMode } from './contexts/PerfModeContext';
import { logError } from './utils/errorLogger';
import './index.css';

const pageVariants = {
  initial: { opacity: 0, y: 18, scale: 0.985 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -10, scale: 0.99 },
};

const pageTransition = {
  type: 'spring' as const,
  stiffness: 420,
  damping: 28,
  mass: 0.85,
};

const Router = import.meta.env.VITE_SINGLE_FILE === 'true' ? HashRouter : BrowserRouter;

const PageWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <motion.div
    variants={pageVariants}
    initial="initial"
    animate="animate"
    exit="exit"
    transition={pageTransition}
    style={{ minHeight: '100vh' }}
  >
    {children}
  </motion.div>
);

const AnimatedRoutes: React.FC = () => {
  const location = useLocation();
  const { perfMode } = usePerfMode();

  return (
    <ErrorBoundary>
      <MotionConfig reducedMotion={perfMode ? 'always' : 'never'} transition={{ type: 'spring', stiffness: 420, damping: 28, mass: 0.85 }}>
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
          <Route path="/" element={<PageWrapper><Home /></PageWrapper>} />
          <Route path="/login" element={<PageWrapper><Login /></PageWrapper>} />
          <Route path="/register" element={<PageWrapper><Register /></PageWrapper>} />
          <Route path="/terms" element={<PageWrapper><Terms /></PageWrapper>} />
          <Route path="/privacy" element={<PageWrapper><Privacy /></PageWrapper>} />
          <Route path="/forgot-password" element={<PageWrapper><ForgotPassword /></PageWrapper>} />
          <Route
            path="/favorites"
            element={
              <ProtectedRoute allowedRoles={['merchant', 'personal', 'admin']}>
                <PageWrapper><Favorites /></PageWrapper>
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute allowedRoles={['merchant', 'personal', 'admin']}>
                <PageWrapper><Profile /></PageWrapper>
              </ProtectedRoute>
            }
          />
          <Route
            path="/my-comments"
            element={
              <ProtectedRoute allowedRoles={['merchant', 'personal', 'admin']}>
                <PageWrapper><MyComments /></PageWrapper>
              </ProtectedRoute>
            }
          />
          <Route
            path="/merchant"
            element={
              <ProtectedRoute allowedRoles={['merchant', 'personal', 'admin']}>
                <PageWrapper><MerchantCenter /></PageWrapper>
              </ProtectedRoute>
            }
          />
          <Route
            path="/merchant/create"
            element={
              <ProtectedRoute allowedRoles={['merchant', 'personal', 'admin']}>
                <PageWrapper><CreateEvent /></PageWrapper>
              </ProtectedRoute>
            }
          />
          <Route
            path="/merchant/edit/:id"
            element={
              <ProtectedRoute allowedRoles={['merchant', 'personal', 'admin']}>
                <PageWrapper><EditEvent /></PageWrapper>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/reviews"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <PageWrapper><AdminMerchantReviews /></PageWrapper>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/settings"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <PageWrapper><AdminSettings /></PageWrapper>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <PageWrapper><AdminUsers /></PageWrapper>
              </ProtectedRoute>
            }
          />
          <Route path="/venues/:id" element={<PageWrapper><VenueDetail /></PageWrapper>} />
          <Route
            path="/merchant/session/create"
            element={
              <ProtectedRoute allowedRoles={['merchant', 'personal', 'admin']}>
                <PageWrapper><CreateSession /></PageWrapper>
              </ProtectedRoute>
            }
          />
          <Route
            path="/merchant/session/edit/:id"
            element={
              <ProtectedRoute allowedRoles={['merchant', 'personal', 'admin']}>
                <PageWrapper><EditSession /></PageWrapper>
              </ProtectedRoute>
            }
          />
          <Route
            path="/merchant/venue/create"
            element={
              <ProtectedRoute allowedRoles={['merchant', 'personal', 'admin']}>
                <PageWrapper><CreateVenue /></PageWrapper>
              </ProtectedRoute>
            }
          />
          <Route
            path="/merchant/venue/edit/:id"
            element={
              <ProtectedRoute allowedRoles={['merchant', 'personal', 'admin']}>
                <PageWrapper><EditVenue /></PageWrapper>
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<PageWrapper><NotFound /></PageWrapper>} />
        </Routes>
      </AnimatePresence>
    </MotionConfig>
    </ErrorBoundary>
  );
};

const App: React.FC = () => {
  // 全局错误收集
  React.useEffect(() => {
    const prevOnerror = window.onerror;
    window.onerror = (msg, source, lineno, colno, error) => {
      logError('error', String(msg), error?.stack);
      if (prevOnerror) prevOnerror(msg, source, lineno, colno, error);
      return false;
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      logError('promise', e.reason?.message || String(e.reason), e.reason?.stack);
    };
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.onerror = prevOnerror;
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return (
    <ThemeProvider>
      <PerfModeProvider>
        <Router>
          <AnalyticsTracker />
          <AnimatedRoutes />
        </Router>
      </PerfModeProvider>
    </ThemeProvider>
  );
};

export default App;
