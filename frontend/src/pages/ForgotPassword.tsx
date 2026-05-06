import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Mail, KeyRound, ArrowRight, Sun, Moon, Loader2 } from 'lucide-react';
import { authService } from '../services/authService';
import { getApiErrorMessage } from '../utils/helpers';
import FloatingDecorations from '../components/FloatingDecorations';
import Footer from '../components/Footer';
import { useTheme } from '../contexts/ThemeContext';

type Step = 'email' | 'reset';

const ForgotPassword: React.FC = () => {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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

  const handleSendCode = useCallback(async () => {
    if (!email) { setError('请输入邮箱'); return; }
    setError(''); setCodeSending(true);
    try {
      await authService.sendVerificationCode(email, 'reset');
      setCountdown(60);
      setStep('reset');
    } catch (err: any) {
      setError(getApiErrorMessage(err, '验证码发送失败'));
    } finally {
      setCodeSending(false);
    }
  }, [email]);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 6) { setError('新密码长度至少为6位'); return; }
    if (newPassword !== confirmPassword) { setError('两次输入的密码不一致'); return; }
    setLoading(true);
    try {
      const res = await authService.forgotPassword(email, code, newPassword);
      setSuccessMessage(res.message || '密码重置成功');
      setTimeout(() => navigate('/login'), 2000);
    } catch (err: any) {
      setError(getApiErrorMessage(err, '密码重置失败'));
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
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-pop-purple border-3 border-ink dark:border-night-400 shadow-block mb-4">
              <Lock className="w-8 h-8 text-white" strokeWidth={2.5} />
            </div>
            <h1 className="font-display text-3xl text-ink dark:text-primary-100 tracking-wide">
              重置<span className="text-gradient">密码</span>
            </h1>
            <p className="mt-2 text-sm text-ink-muted dark:text-primary-100/60">
              {step === 'email' ? '输入注册邮箱获取验证码' : '请输入验证码并设置新密码'}
            </p>
          </div>

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

          <AnimatePresence mode="wait">
            {step === 'email' ? (
              <motion.div key="email" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="space-y-4">
                <div>
                  <label className="label-block flex items-center gap-1.5"><Mail className="w-4 h-4" /> 邮箱</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="input-block" placeholder="请输入注册时使用的邮箱" required />
                </div>
                <button type="button" onClick={handleSendCode} disabled={codeSending} className="btn-action w-full !py-3.5">
                  {codeSending ? <><Loader2 className="w-5 h-5 animate-spin" /> 发送中...</> : <>发送验证码 <ArrowRight className="w-5 h-5" /></>}
                </button>
              </motion.div>
            ) : (
              <motion.form key="reset" onSubmit={handleReset} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                <div className="px-4 py-3 rounded-xl bg-pop-cyan/20 border-2 border-ink dark:border-night-400 text-sm text-ink dark:text-primary-200">
                  ✉ 验证码已发送至 <span className="font-bold">{email}</span>
                </div>

                <div>
                  <label className="label-block flex items-center gap-1.5"><KeyRound className="w-4 h-4" /> 验证码</label>
                  <div className="flex gap-2">
                    <input type="text" value={code} onChange={e => setCode(e.target.value)} className="input-block flex-1" placeholder="6位验证码" maxLength={6} required />
                    <button type="button" onClick={handleSendCode} disabled={codeSending || countdown > 0} className="btn-primary !py-3 !px-4 !text-sm whitespace-nowrap">
                      {codeSending ? '...' : countdown > 0 ? `${countdown}s` : '重发'}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="label-block flex items-center gap-1.5"><Lock className="w-4 h-4" /> 新密码</label>
                  <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="input-block" placeholder="至少6位" required />
                </div>

                <div>
                  <label className="label-block flex items-center gap-1.5"><Lock className="w-4 h-4" /> 确认新密码</label>
                  <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="input-block" placeholder="再次输入新密码" required />
                </div>

                <button type="submit" disabled={loading} className="btn-action w-full !py-3.5">
                  {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> 重置中...</> : <>重置密码 <ArrowRight className="w-5 h-5" /></>}
                </button>
              </motion.form>
            )}
          </AnimatePresence>

          <div className="mt-5 pt-4 border-t-2 border-dashed border-ink/20 dark:border-night-400 text-center space-y-2">
            <Link to="/login" className="link-action font-bold text-sm">返回登录</Link>
            <br />
            <Link to="/" className="inline-block text-sm link-primary">← 返回首页</Link>
          </div>
        </motion.div>
      </div>

      <div className="relative z-10"><Footer /></div>
    </div>
  );
};

export default ForgotPassword;
