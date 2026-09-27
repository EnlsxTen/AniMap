import React from 'react';
import { logError } from '../utils/errorLogger';

interface Props { children: React.ReactNode; }
interface State { hasError: boolean; fatal: boolean; }

// 连续崩溃达到此次数后停止自动恢复，避免渲染期持续报错导致的无限闪烁循环
const MAX_AUTO_RECOVER = 3;
// 距上次崩溃超过此时间则视为新的独立错误，重置计数
const RESET_WINDOW_MS = 10000;

class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, fatal: false };
  private errorCount = 0;
  private lastErrorAt = 0;
  private recoverTimer: ReturnType<typeof setTimeout> | null = null;

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('[ErrorBoundary] caught:', error.message);
    logError('react', error.message, error.stack);

    const now = Date.now();
    // 距上次崩溃已超过窗口期 → 当作全新错误，计数归零
    if (now - this.lastErrorAt > RESET_WINDOW_MS) this.errorCount = 0;
    this.lastErrorAt = now;
    this.errorCount += 1;

    // 短时间内连续崩溃 → 多半是渲染期持续性错误，自动恢复只会无限闪烁，停在错误页
    if (this.errorCount >= MAX_AUTO_RECOVER) {
      this.setState({ fatal: true });
      return;
    }

    if (this.recoverTimer) clearTimeout(this.recoverTimer);
    this.recoverTimer = setTimeout(() => this.setState({ hasError: false }), 3000);
  }

  componentWillUnmount() {
    if (this.recoverTimer) clearTimeout(this.recoverTimer);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.fatal) {
      return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-primary-50 p-6 dark:bg-night-200">
          <div className="max-w-sm space-y-4 text-center">
            <p className="text-base font-bold text-ink dark:text-primary-100">页面遇到了点问题</p>
            <p className="text-sm text-ink-muted dark:text-primary-100/60">刷新一下通常就能恢复，如果反复出现可以联系我们反馈。</p>
            <button
              type="button"
              onClick={this.handleReload}
              className="btn-action mx-auto !px-6"
            >
              刷新页面
            </button>
          </div>
        </div>
      );
    }

    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-primary-50 dark:bg-night-200">
          <div className="text-center space-y-2">
            <div className="w-10 h-10 mx-auto border-3 border-ink/20 border-t-action rounded-full animate-spin" />
            <p className="text-sm text-ink-muted">加载中，请稍候...</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
