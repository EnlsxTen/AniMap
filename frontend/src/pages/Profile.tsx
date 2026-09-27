import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, CheckCircle2, Loader2, Lock, Mail, ShieldCheck, Upload, UserRound } from 'lucide-react';
import NavHeader from '../components/NavHeader';
import AnimatedPage from '../components/AnimatedPage';
import LoadingSpinner from '../components/LoadingSpinner';
import { authService } from '../services/authService';
import { User } from '../types';
import ScrollToTop from '../components/ScrollToTop';
import { getApiErrorMessage, getImageUrl, getStoredUser } from '../utils/helpers';

const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)[\S]{8,128}$/;

const roleLabel: Record<User['role'], string> = {
  admin: '管理员',
  merchant: '商户',
  personal: '个人用户',
};

const Profile: React.FC = () => {
  const [user, setUser] = useState<User | null>(() => getStoredUser());
  const [loading, setLoading] = useState(true);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  useEffect(() => {
    authService.getProfile()
      .then(({ user: freshUser }) => {
        setUser(freshUser);
        localStorage.setItem('user', JSON.stringify(freshUser));
      })
      .catch(err => setError(getApiErrorMessage(err, '加载个人资料失败，请刷新重试')))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview(null);
      return;
    }
    const url = URL.createObjectURL(avatarFile);
    setAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(''), 2200);
    return () => window.clearTimeout(timer);
  }, [message]);

  const avatarSrc = useMemo(() => {
    if (avatarPreview) return avatarPreview;
    if (user?.avatar_url) return getImageUrl(user.avatar_url, 'thumb');
    return null;
  }, [avatarPreview, user?.avatar_url]);

  const syncUser = (nextUser: User) => {
    setUser(nextUser);
    localStorage.setItem('user', JSON.stringify(nextUser));
    window.dispatchEvent(new Event('animap:user-updated'));
  };

  const handleAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setError('');
    setMessage('');

    if (!file) {
      setAvatarFile(null);
      return;
    }

    if (!file.type.startsWith('image/')) {
      setError('请选择图片文件');
      event.target.value = '';
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('头像图片不能超过 10MB');
      event.target.value = '';
      return;
    }

    setAvatarFile(file);
  };

  const handleSaveAvatar = async () => {
    if (!avatarFile) return;
    setAvatarSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await authService.updateAvatar(avatarFile);
      syncUser(response.user);
      setAvatarFile(null);
      setMessage(response.message || '头像已更新');
    } catch (err) {
      setError(getApiErrorMessage(err, '头像更新失败，请稍后重试'));
    } finally {
      setAvatarSaving(false);
    }
  };

  const handlePasswordSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!PASSWORD_REGEX.test(passwordForm.newPassword)) {
      setError('新密码至少 8 位，并且需要同时包含字母和数字');
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError('两次输入的新密码不一致');
      return;
    }

    setPasswordSaving(true);
    try {
      const response = await authService.changePassword(passwordForm.currentPassword, passwordForm.newPassword);
      if (response.token) {
        localStorage.setItem('token', response.token);
      }
      syncUser(response.user);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setMessage(response.message || '密码已更新');
    } catch (err) {
      setError(getApiErrorMessage(err, '密码修改失败，请稍后重试'));
    } finally {
      setPasswordSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-primary-50 dark:bg-night-200">
        <NavHeader title="账号管理" backTo="/" />
        <div className="py-24">
          <LoadingSpinner size="lg" text="加载个人资料..." />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-primary-50 dark:bg-night-200">
      <NavHeader title="账号管理" backTo="/" />
      <AnimatedPage>
        <main className="container mx-auto max-w-5xl px-4 py-6 sm:px-6">
          <AnimatePresence>
            {(message || error) && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.98 }}
                className={`mb-4 rounded-xl border-3 px-4 py-3 text-sm font-display shadow-block-sm ${
                  error
                    ? 'border-pop-rose bg-pop-rose/10 text-pop-rose'
                    : 'border-primary-600 bg-primary-200/70 text-primary-900'
                }`}
                role="status"
              >
                {error || message}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
            <motion.section
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              className="card-block overflow-hidden"
            >
              <div className="bg-action p-5 text-white border-b-3 border-ink dark:border-night-400">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl border-3 border-white/50 bg-white/20">
                    <UserRound className="h-5 w-5" />
                  </div>
                  <div>
                    <h1 className="font-display text-2xl tracking-wide">个人资料</h1>
                    <p className="text-sm text-white/80">头像和账号信息</p>
                  </div>
                </div>
              </div>

              <div className="p-5">
                <div className="flex flex-col items-center text-center">
                  <div className="relative mb-4">
                    <div className="h-32 w-32 overflow-hidden rounded-2xl border-3 border-ink bg-primary-100 shadow-block dark:border-night-400 dark:bg-night-200">
                      {avatarSrc ? (
                        <img src={avatarSrc} alt={user?.username || '用户头像'} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-pop-yellow/30">
                          <UserRound className="h-14 w-14 text-ink-muted dark:text-primary-100/60" strokeWidth={1.8} />
                        </div>
                      )}
                    </div>
                    <div className="absolute -bottom-2 -right-2 flex h-11 w-11 items-center justify-center rounded-xl border-3 border-ink bg-pop-cyan shadow-block-sm dark:border-night-400">
                      <Camera className="h-5 w-5 text-ink" />
                    </div>
                  </div>

                  <h2 className="font-display text-xl text-ink dark:text-primary-100">{user?.username}</h2>
                  <p className="mt-1 text-sm text-ink-muted dark:text-primary-100/60">{roleLabel[user?.role || 'personal']}</p>

                  <div className="mt-5 grid w-full gap-3">
                    <label className="btn-secondary w-full cursor-pointer !py-3">
                      <input id="avatar" name="avatar" type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
                      <Upload className="h-5 w-5" />
                      选择头像
                    </label>
                    <button
                      type="button"
                      onClick={handleSaveAvatar}
                      disabled={!avatarFile || avatarSaving}
                      className="btn-action w-full !py-3"
                    >
                      {avatarSaving ? <><Loader2 className="h-5 w-5 animate-spin" /> 保存中...</> : <><CheckCircle2 className="h-5 w-5" /> 保存头像</>}
                    </button>
                  </div>
                </div>

                <div className="mt-6 space-y-3 border-t-2 border-dashed border-ink/20 pt-5 dark:border-night-400">
                  <div className="flex items-center gap-3 rounded-xl bg-primary-50 p-3 dark:bg-night-200">
                    <Mail className="h-5 w-5 text-action" />
                    <div className="min-w-0">
                      <p className="text-xs text-ink-muted dark:text-primary-100/60">邮箱</p>
                      <p className="truncate text-sm font-medium text-ink dark:text-primary-100">{user?.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-xl bg-primary-50 p-3 dark:bg-night-200">
                    <ShieldCheck className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                    <div>
                      <p className="text-xs text-ink-muted dark:text-primary-100/60">账号状态</p>
                      <p className="text-sm font-medium text-ink dark:text-primary-100">
                        {user?.approval_status === 'pending' ? '审核中' : user?.approval_status === 'rejected' ? '已拒绝' : '正常'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="card-block p-5 sm:p-6"
            >
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border-3 border-ink bg-pop-purple shadow-block-sm dark:border-night-400">
                  <Lock className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="font-display text-2xl text-ink dark:text-primary-100">修改密码</h2>
                  <p className="text-sm text-ink-muted dark:text-primary-100/60">更新后当前登录会自动续签</p>
                </div>
              </div>

              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <input
                  id="profileUsername"
                  name="username"
                  type="text"
                  autoComplete="username"
                  value={user?.email || ''}
                  readOnly
                  tabIndex={-1}
                  aria-hidden="true"
                  className="sr-only"
                />
                <div>
                  <label htmlFor="currentPassword" className="label-block">当前密码</label>
                  <input
                    id="currentPassword"
                    name="currentPassword"
                    type="password"
                    value={passwordForm.currentPassword}
                    onChange={event => setPasswordForm(prev => ({ ...prev, currentPassword: event.target.value }))}
                    className="input-block"
                    autoComplete="current-password"
                    required
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="newPassword" className="label-block">新密码</label>
                    <input
                      id="newPassword"
                      name="newPassword"
                      type="password"
                      value={passwordForm.newPassword}
                      onChange={event => setPasswordForm(prev => ({ ...prev, newPassword: event.target.value }))}
                      className="input-block"
                      autoComplete="new-password"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="confirmPassword" className="label-block">确认新密码</label>
                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type="password"
                      value={passwordForm.confirmPassword}
                      onChange={event => setPasswordForm(prev => ({ ...prev, confirmPassword: event.target.value }))}
                      className="input-block"
                      autoComplete="new-password"
                      required
                    />
                  </div>
                </div>

                <div className="rounded-xl border-2 border-ink/10 bg-primary-50 p-4 text-sm text-ink-muted dark:border-night-400 dark:bg-night-200 dark:text-primary-100/60">
                  密码至少 8 位，并且需要同时包含字母和数字。
                </div>

                <button type="submit" disabled={passwordSaving} className="btn-action w-full sm:w-auto !py-3">
                  {passwordSaving ? <><Loader2 className="h-5 w-5 animate-spin" /> 更新中...</> : <><Lock className="h-5 w-5" /> 更新密码</>}
                </button>
              </form>
            </motion.section>
          </div>
        </main>
      </AnimatedPage>
      <ScrollToTop />
    </div>
  );
};

export default Profile;
