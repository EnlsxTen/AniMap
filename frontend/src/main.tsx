import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// 高德地图安全密钥需在加载 JS API 前设置
(window as any)._AMapSecurityConfig = {
  securityJsCode: import.meta.env.VITE_AMAP_SECURITY_CODE || '',
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
