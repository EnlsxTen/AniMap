const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export const analyticsService = {
  heartbeat: async (durationSeconds: number, pagePath: string, sessionId: string): Promise<void> => {
    const token = localStorage.getItem('token');
    if (!token) return;

    await fetch(`${API_BASE_URL}/analytics/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ durationSeconds, pagePath, sessionId }),
      keepalive: true,
    });
  },
};
