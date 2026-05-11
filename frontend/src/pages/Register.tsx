import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, User, Mail, Lock, KeyRound, Phone, ArrowRight, Sun, Moon, Loader2 } from 'lucide-react';
import { authService } from '../services/authService';
import { getApiErrorMessage } from '../utils/helpers';
import FloatingDecorations from '../components/FloatingDecorations';
import Footer from '../components/Footer';
import { useTheme } from '../contexts/ThemeContext';

const Register: React.FC = () => {
  const [userType, setUserType] = useState<'personal' | 'merchant'>('personal');
  const [formData, setFormData] = useState({
    email: '', password: '', confirmPassword: '', username: '', phone: '', verificationCode: '',
  });
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [codeSending, setCodeSending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSendCode = useCallback(async () => {
    if (!formData.email) { setError('请先输入邮箱'); return; }
    setError(''); setCodeSending(true);
    try {
      await authService.sendVerificationCode(formData.email, 'register');
      setCountdown(60);
    } catch (err: any) {
      setError(getApiErrorMessage(err, '验证码发送失败'));
    } finally {
      setCodeSending(false);
    }
  }, [formData.email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccessMessage('');
    if (formData.password !== formData.confirmPassword) { setError('两次输入的密码不一致'); return; }
    if (!/^(?=.*[A-Za-z])(?=.*\d)[\S]{8,128}$/.test(formData.password)) {
      setError('密码至少 8 位，且必须同时包含字母和数字'); return;
    }
    if (!formData.verificationCode) { setError('请输入邮箱验证码'); return; }
    setLoading(true);
    try {
      const response = await authService.register(
        formData.email, formData.password, formData.username,
        userType, formData.verificationCode, formData.phone
      );
      if (response.requiresApproval) {
        setSuccessMessage(response.message || '商户注册申请已提交，请等待管理员审核');
        setFormData({ email: '', password: '', confirmPassword: '', username: '', phone: '', verificationCode: '' });
        return;
      }
      if (response.token) {
        localStorage.setItem('token', response.token);
        localStorage.setItem('user', JSON.stringify(response.user));
        navigate('/');
      }
    } catch (err: any) {
      setError(getApiErrorMessage(err, '注册失败，请稍后重试'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen-safe flex flex-col bg-primary-50 dark:bg-night-200 relative overflow-hidden">
      <FloatingDecorations />

      <div className="absolute top-4 right-4 z-30">
        <button onClick={toggleTheme} className="btn-icon" aria-label="切换主题">
          {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
      </div>

      <div className="relative z-10 flex-1 flex items-center justify-center p-4 py-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 0.61, 0.36, 1] }}
          className="w-full max-w-md card-flat shadow-block-lg p-7 sm:p-8"
        >
          <div className="text-center mb-6">
            <Link to="/" className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-action border-3 border-ink dark:border-night-400 shadow-block mb-4 hover:-translate-y-1 hover:shadow-block-lg transition-all duration-200">
              <Sparkles className="w-8 h-8 text-white" strokeWidth={2.5} />
            </Link>
            <h1 className="font-display text-3xl text-ink dark:text-primary-100 tracking-wide">
              加入 <span className="text-gradient">AniMap</span>
            </h1>
            <p className="mt-2 text-sm text-ink-muted dark:text-primary-100/60">创建你的账户</p>
          </div>

          {/* 用户类型 */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            {(['personal', 'merchant'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => { setUserType(t); setError(''); setSuccessMessage(''); }}
                className={userType === t ? 'tab-block-active' : 'tab-block-inactive'}
              >
                {t === 'personal' ? '个人用户' : '商户入驻'}
              </button>
            ))}
          </div>

          {/* Info */}
          <div className={`mb-4 px-4 py-3 rounded-xl border-2 border-ink dark:border-night-400 text-sm text-ink dark:text-primary-200 ${
            userType === 'merchant' ? 'bg-pop-yellow/30' : 'bg-primary-200/40 dark:bg-primary-500/10'
          }`}>
            {userType === 'merchant'
              ? '⚠ 商户账号提交后需管理员审核，审核通过后可登录'
              : '✓ 个人用户注册后即可登录，可浏览展会并发布活动'}
          </div>

          {/* 消息 */}
          <AnimatePresence>
            {successMessage && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mb-4 px-4 py-3 rounded-xl bg-primary-200/60 border-2 border-primary-600 text-sm text-primary-900 font-medium"
              >
                ✓ {successMessage}
              </motion.div>
            )}
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

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="label-block flex items-center gap-1.5"><User className="w-4 h-4" /> 用户名</label>
              <input type="text" name="username" value={formData.username} onChange={handleChange} className="input-block" placeholder="请输入用户名" autoComplete="nickname" required />
            </div>

            <div>
              <label className="label-block flex items-center gap-1.5"><Mail className="w-4 h-4" /> 邮箱</label>
              <input type="email" name="email" value={formData.email} onChange={handleChange} className="input-block" placeholder="请输入邮箱" autoComplete="email" required />
            </div>

            <div>
              <label className="label-block flex items-center gap-1.5"><KeyRound className="w-4 h-4" /> 邮箱验证码</label>
              <div className="flex gap-2">
                <input type="text" name="verificationCode" value={formData.verificationCode} onChange={handleChange} className="input-block flex-1" placeholder="6位验证码" maxLength={6} autoComplete="one-time-code" required />
                <button type="button" onClick={handleSendCode} disabled={codeSending || countdown > 0} className="btn-primary !py-3 !px-4 !text-sm whitespace-nowrap flex-shrink-0">
                  {codeSending ? '...' : countdown > 0 ? `${countdown}s` : '发送'}
                </button>
              </div>
            </div>

            <div>
              <label className="label-block flex items-center gap-1.5"><Phone className="w-4 h-4" /> 手机号 <span className="text-ink-muted/60 font-normal">(可选)</span></label>
              <input type="tel" name="phone" value={formData.phone} onChange={handleChange} className="input-block" placeholder="请输入手机号" autoComplete="tel" />
            </div>

            <div>
              <label className="label-block flex items-center gap-1.5"><Lock className="w-4 h-4" /> 密码</label>
              <input type="password" name="password" value={formData.password} onChange={handleChange} className="input-block" placeholder="至少 8 位，含字母+数字" autoComplete="new-password" required />
            </div>

            <div>
              <label className="label-block flex items-center gap-1.5"><Lock className="w-4 h-4" /> 确认密码</label>
              <input type="password" name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} className="input-block" placeholder="再次输入密码" autoComplete="new-password" required />
            </div>

            <button type="submit" disabled={loading} className="btn-action w-full !py-3.5 !mt-5">
              {loading ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> 提交中...</>
              ) : (
                <>{userType === 'merchant' ? '提交商户申请' : '注册账号'} <ArrowRight className="w-5 h-5" /></>
              )}
            </button>
          </form>

          <div className="mt-5 pt-4 border-t-2 border-dashed border-ink/20 dark:border-night-400 text-center space-y-2">
            <p className="text-sm text-ink-muted dark:text-primary-100/60">
              已有账户？{' '}
              <Link to="/login" className="link-action font-bold">去登录</Link>
            </p>
            <Link to="/" className="inline-block text-sm link-primary">← 返回首页</Link>
          </div>
        </motion.div>
      </div>

      <div className="relative z-10"><Footer /></div>
    </div>
  );
};

export default Register;
