import React from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
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
import AdminMerchantReviews from './pages/AdminMerchantReviews';
import AdminSettings from './pages/AdminSettings';
import NotFound from './pages/NotFound';
import ProtectedRoute from './components/ProtectedRoute';
import { ThemeProvider } from './contexts/ThemeContext';
import './index.css';

const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

const pageTransition = {
  duration: 0.25,
  ease: 'easeInOut' as const,
};

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

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<PageWrapper><Home /></PageWrapper>} />
        <Route path="/login" element={<PageWrapper><Login /></PageWrapper>} />
        <Route path="/register" element={<PageWrapper><Register /></PageWrapper>} />
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
  );
};

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <Router>
        <AnimatedRoutes />
      </Router>
    </ThemeProvider>
  );
};

export default App;
