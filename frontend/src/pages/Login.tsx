import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Mail, Lock, KeyRound, ArrowRight, Sun, Moon, Loader2 } from 'lucide-react';
import { authService } from '../services/authService';
import { getApiErrorMessage } from '../utils/helpers';
import { AuthResponse } from '../types';
import AuthBackground from '../components/AuthBackground';
import Footer from '../components/Footer';
import { useTheme } from '../contexts/ThemeContext';

type LoginMode = 'merchant' | 'personal';
type AuthMethod = 'password' | 'code';

const Login: React.FC = () => {
  const [loginMode, setLoginMode] = useState<LoginMode>('merchant');
  const [authMethod, setAuthMethod] = useState<AuthMethod>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [codeSending, setCodeSending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [agreed, setAgreed] = useState(false);
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const handleSendCode = useCallback(async () => {
    if (!email) { setError('请先输入邮箱'); return; }
    setError(''); setCodeSending(true);
    try {
      await authService.sendVerificationCode(email, 'login');
      setCountdown(60);
    } catch (err: any) {
      setError(getApiErrorMessage(err, '验证码发送失败'));
    } finally {
      setCodeSending(false);
    }
  }, [email]);

  const handleLoginSuccess = (response: AuthResponse) => {
    if (!response.token) { setError('登录失败，请联系网站管理员'); return; }
    if (loginMode === 'merchant' && !['merchant', 'admin'].includes(response.user.role)) {
      setError('当前账号不是商户账号，请切换到个人用户登录'); return;
    }
    if (loginMode === 'personal' && ['merchant', 'admin'].includes(response.user.role)) {
      setError(response.user.role === 'admin' ? '当前账号是管理员账号，请切换到商户登录' : '当前账号是商户账号，请切换到商户登录'); return;
    }
    localStorage.setItem('token', response.token);
    localStorage.setItem('user', JSON.stringify(response.user));
    navigate(response.user.role === 'admin' ? '/' : '/merchant');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const response = authMethod === 'password'
        ? await authService.login(email, password)
        : await authService.loginByCode(email, code);
      handleLoginSuccess(response);
    } catch (err: any) {
      setError(getApiErrorMessage(err, authMethod === 'password' ? '登录失败，请检查邮箱和密码' : '登录失败，请检查验证码'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen-safe flex flex-col bg-primary-50 dark:bg-night-200 relative overflow-hidden">
      <AuthBackground />

      {/* 顶部主题切换 */}
      <div className="absolute top-4 right-4 z-30">
        <button onClick={toggleTheme} className="btn-icon" aria-label="切换主题">
          {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
      </div>

      <div className="relative z-10 flex-1 flex items-center justify-center p-4 py-10 min-h-screen-safe">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 0.61, 0.36, 1] }}
          className="auth-card w-full max-w-md card-flat shadow-block-lg p-7 sm:p-8"
        >
          {/* Logo */}
          <div className="text-center mb-6">
            <Link to="/" className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-action border-3 border-ink dark:border-night-400 shadow-block mb-4 hover:-translate-y-1 hover:shadow-block-lg transition-all duration-200">
              <Sparkles className="w-8 h-8 text-white" strokeWidth={2.5} />
            </Link>
            <h1 className="font-display text-3xl text-ink dark:text-primary-100 tracking-wide">
              Ani<span className="text-gradient">Map</span>
            </h1>
            <p className="mt-2 text-sm text-ink-muted dark:text-primary-100/60">登录你的账号</p>
          </div>

          {/* 模式切换 */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            {(['merchant', 'personal'] as LoginMode[]).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setLoginMode(m)}
                className={loginMode === m ? 'tab-block-active' : 'tab-block-inactive'}
              >
                {m === 'merchant' ? '商户登录' : '个人用户'}
              </button>
            ))}
          </div>

          {/* 登录方式 */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            {(['password', 'code'] as AuthMethod[]).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setAuthMethod(m)}
                className={authMethod === m ? 'tab-block-active' : 'tab-block-inactive'}
              >
                {m === 'password' ? '密码登录' : '验证码登录'}
              </button>
            ))}
          </div>

          {/* Info 提示 */}
          <div className="mb-4 px-4 py-3 rounded-xl bg-pop-yellow/30 dark:bg-pop-yellow/10 border-2 border-ink dark:border-night-400 text-sm text-ink dark:text-primary-200">
            {loginMode === 'merchant' ? '⚠ 商户账号需审核通过后才能登录' : '✓ 个人用户登录后可直接发布活动'}
          </div>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-4 px-4 py-3 rounded-xl bg-pop-rose/15 border-2 border-pop-rose text-sm text-pop-rose font-medium"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label-block flex items-center gap-1.5">
                <Mail className="w-4 h-4" /> 邮箱
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="input-block"
                placeholder="请输入邮箱"
                autoComplete="username"
                required
              />
            </div>

            {authMethod === 'password' ? (
              <div>
                <label className="label-block flex items-center gap-1.5">
                  <Lock className="w-4 h-4" /> 密码
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="input-block"
                  placeholder="请输入密码"
                  autoComplete="current-password"
                  required
                />
              </div>
            ) : (
              <div>
                <label className="label-block flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4" /> 验证码
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={code}
                    onChange={e => setCode(e.target.value)}
                    className="input-block flex-1"
                    placeholder="6位验证码"
                    maxLength={6}
                    required
                  />
                  <button
                    type="button"
                    onClick={handleSendCode}
                    disabled={codeSending || countdown > 0}
                    className="btn-primary !py-3 !px-4 !text-sm whitespace-nowrap"
                  >
                    {codeSending ? '...' : countdown > 0 ? `${countdown}s` : '发送'}
                  </button>
                </div>
              </div>
            )}

            <label className="flex items-start gap-2 cursor-pointer mt-2 py-1">
              <input
                type="checkbox"
                checked={agreed}
                onChange={e => setAgreed(e.target.checked)}
                className="mt-0.5 h-5 w-5 flex-shrink-0 rounded-md border-2 border-ink/30 text-action focus:ring-4 focus:ring-action/30 cursor-pointer accent-action dark:border-night-400"
              />
              <span className="text-sm text-ink-muted dark:text-primary-100/65 leading-relaxed">
                我已阅读并同意
                <Link to="/terms" className="link-action font-bold mx-0.5">用户协议</Link>
                和
                <Link to="/privacy" className="link-action font-bold mx-0.5">隐私政策</Link>
              </span>
            </label>

            <button type="submit" disabled={loading || !agreed} className="btn-action w-full !py-3.5 disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> 登录中...</>
              ) : (
                <>登录 <ArrowRight className="w-5 h-5" /></>
              )}
            </button>
          </form>

          {authMethod === 'password' && (
            <p className="text-center mt-4">
              <Link to="/forgot-password" className="link-primary text-sm">忘记密码？</Link>
            </p>
          )}

          <div className="mt-5 pt-4 border-t-2 border-dashed border-ink/20 dark:border-night-400 text-center space-y-2">
            <p className="text-sm text-ink-muted dark:text-primary-100/60">
              还没有账户？{' '}
              <Link to="/register" className="link-action font-bold">注册账号</Link>
            </p>
            <Link to="/" className="inline-block text-sm link-primary">← 返回首页</Link>
          </div>
        </motion.div>
      </div>

      <div className="relative z-10"><Footer /></div>
    </div>
  );
};

export default Login;
