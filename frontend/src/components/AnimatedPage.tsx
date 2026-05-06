import React from 'react';
import { motion } from 'framer-motion';

interface AnimatedPageProps {
  children: React.ReactNode;
  className?: string;
}

const AnimatedPage: React.FC<AnimatedPageProps> = ({ children, className = '' }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.3, ease: [0.22, 0.61, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

export default AnimatedPage;
