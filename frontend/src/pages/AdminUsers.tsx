import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock3, Globe2, Mail, MapPin, MonitorSmartphone, Phone, Search, ShieldCheck, Trash2, UserRound, Users } from 'lucide-react';
import { authService } from '../services/authService';
import { AdminUser } from '../types';
import { formatDate, getApiErrorMessage, getImageUrl } from '../utils/helpers';
import AnimatedPage from '../components/AnimatedPage';
import LoadingSpinner from '../components/LoadingSpinner';
import NavHeader from '../components/NavHeader';

const ROLE_LABEL: Record<AdminUser['role'], string> = {
  admin: '管理员',
  merchant: '商户',
  personal: '个人用户',
};

const STATUS_LABEL: Record<string, string> = {
  approved: '已通过',
  pending: '待审核',
  rejected: '已拒绝',
};

const DEVICE_LABEL: Record<string, string> = {
  mobile: '手机',
  tablet: '平板',
  desktop: '电脑',
};

const formatDuration = (seconds: number = 0): string => {
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes > 0 ? `${hours} 小时 ${restMinutes} 分钟` : `${hours} 小时`;
};

const AdminUsers: React.FC = () => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  // 删除确认弹窗
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [confirmInput, setConfirmInput] = useState('');
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const inputMatches = deleteTarget ? confirmInput === deleteTarget.username : false;
  const canDelete = inputMatches && confirmChecked && !deleting;

  const openDeleteModal = (user: AdminUser) => {
    setDeleteTarget(user);
    setConfirmInput('');
    setConfirmChecked(false);
    setDeleteError('');
  };
  const closeDeleteModal = () => { if (!deleting) setDeleteTarget(null); };

  const handleDelete = async () => {
    if (!deleteTarget || !canDelete) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await authService.deleteAdminUser(deleteTarget.id);
      setUsers(prev => prev.filter(u => u.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(getApiErrorMessage(err, '删除失败'));
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    authService.getAdminUsers()
      .then(res => setUsers(res.users))
      .catch(err => setError(getApiErrorMessage(err, '加载用户列表失败')))
      .finally(() => setLoading(false));
  }, []);

  const filteredUsers = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return users;
    return users.filter(user =>
      user.username.toLowerCase().includes(keyword) ||
      user.email.toLowerCase().includes(keyword) ||
      (user.phone || '').toLowerCase().includes(keyword) ||
      ROLE_LABEL[user.role].includes(keyword)
    );
  }, [query, users]);

  const roleCounts = useMemo(() => ({
    total: users.length,
    admin: users.filter(user => user.role === 'admin').length,
    merchant: users.filter(user => user.role === 'merchant').length,
    personal: users.filter(user => user.role === 'personal').length,
  }), [users]);

  return (
    <div className="min-h-screen bg-primary-50 dark:bg-night-200">
      <NavHeader title="用户管理" backTo="/" />
      <AnimatedPage>
        <div className="container mx-auto max-w-5xl p-4 sm:p-6">
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: '全部用户', value: roleCounts.total, icon: Users, color: 'bg-action' },
              { label: '管理员', value: roleCounts.admin, icon: ShieldCheck, color: 'bg-pop-rose' },
              { label: '商户', value: roleCounts.merchant, icon: UserRound, color: 'bg-pop-purple' },
              { label: '个人用户', value: roleCounts.personal, icon: UserRound, color: 'bg-pop-cyan' },
            ].map(item => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="card-block p-4">
                  <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl border-2 border-ink ${item.color} text-white shadow-block-sm`}>
                    <Icon className="h-5 w-5" strokeWidth={2.4} />
                  </div>
                  <p className="text-xs font-display text-ink-muted dark:text-primary-100/60">{item.label}</p>
                  <p className="mt-1 font-display text-3xl text-ink dark:text-primary-100">{item.value}</p>
                </div>
              );
            })}
          </div>

          <div className="card-block mb-4 p-3">
            <div className="flex items-center gap-2 rounded-xl border-2 border-ink bg-white px-3 py-2 dark:border-night-400 dark:bg-night-100">
              <Search className="h-5 w-5 text-ink-muted" />
              <input
                id="admin-user-search"
                name="admin-user-search"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="搜索用户名、邮箱、手机号"
                className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted dark:text-primary-100"
              />
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border-2 border-pop-rose bg-pop-rose/15 px-4 py-3 text-sm font-medium text-pop-rose">
              {error}
            </div>
          )}

          {loading ? (
            <div className="py-20"><LoadingSpinner size="lg" text="加载用户..." /></div>
          ) : filteredUsers.length === 0 ? (
            <div className="card-block p-12 text-center">
              <Users className="mx-auto mb-3 h-12 w-12 text-ink-muted" strokeWidth={1.5} />
              <p className="font-display text-xl text-ink dark:text-primary-100">没有匹配的用户</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredUsers.map((user, index) => (
                <motion.div
                  key={user.id}
                  initial={{ opacity: 0, y: 16, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: 'spring', damping: 24, stiffness: 430, delay: index * 0.02 }}
                  className="card-block p-4"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-xl border-3 border-ink bg-primary-100 shadow-block-sm dark:border-night-400 dark:bg-night-200">
                        {user.avatar_url ? (
                          <img src={getImageUrl(user.avatar_url, 'thumb')} alt={user.username} className="h-full w-full object-cover" />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center">
                            <UserRound className="h-6 w-6 text-ink-muted" />
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-display text-base text-ink dark:text-primary-100">{user.username}</h2>
                          <span className="rounded-lg border border-ink/20 bg-action/10 px-2 py-0.5 text-xs font-display text-action dark:border-night-400">
                            {ROLE_LABEL[user.role]}
                          </span>
                          {user.approval_status && (
                            <span className="rounded-lg border border-ink/20 bg-primary-100 px-2 py-0.5 text-xs text-ink-muted dark:border-night-400 dark:bg-night-200 dark:text-primary-100/70">
                              {STATUS_LABEL[user.approval_status] || user.approval_status}
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex flex-col gap-1 text-xs text-ink-muted dark:text-primary-100/60 sm:flex-row sm:gap-4">
                          <span className="flex min-w-0 items-center gap-1"><Mail className="h-3.5 w-3.5" />{user.email}</span>
                          {user.phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{user.phone}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-ink-muted dark:text-primary-100/60 sm:text-right">
                      <p>注册：{user.created_at ? formatDate(user.created_at) : '-'}</p>
                      {user.updated_at && <p className="mt-1">更新：{formatDate(user.updated_at)}</p>}
                      {user.role !== 'admin' && (
                        <button
                          type="button"
                          onClick={() => openDeleteModal(user)}
                          className="mt-2 flex items-center gap-1 rounded-lg border-2 border-pop-rose px-2 py-1 text-xs font-medium text-pop-rose transition-colors hover:bg-pop-rose hover:text-white dark:border-pop-rose/70 dark:text-pop-rose/70"
                        >
                          <Trash2 className="h-3 w-3" /> 删除账号
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 grid gap-2 border-t-2 border-ink/10 pt-3 text-xs text-ink-muted dark:border-night-400 dark:text-primary-100/60 sm:grid-cols-2 lg:grid-cols-4">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <Clock3 className="h-3.5 w-3.5 flex-shrink-0" />
                      停留 {formatDuration(user.analytics?.total_duration_seconds || 0)}
                    </span>
                    <span className="flex min-w-0 items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 flex-shrink-0" />
                      访问 {user.analytics?.visit_count || 0} 次
                    </span>
                    <span className="flex min-w-0 items-center gap-1.5">
                      <MonitorSmartphone className="h-3.5 w-3.5 flex-shrink-0" />
                      {user.analytics?.last_device_type ? DEVICE_LABEL[user.analytics.last_device_type] || user.analytics.last_device_type : '设备未知'}
                    </span>
                    <span className="flex min-w-0 items-center gap-1.5">
                      <Globe2 className="h-3.5 w-3.5 flex-shrink-0" />
                      {user.analytics?.last_seen_at ? formatDate(user.analytics.last_seen_at) : '暂无访问'}
                    </span>
                    <span className="flex min-w-0 items-center gap-1.5 sm:col-span-2">
                      <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="truncate">
                        IP {user.analytics?.last_ip || '-'}{user.analytics?.last_ip_location ? ` · ${user.analytics.last_ip_location}` : ''}
                      </span>
                    </span>
                    <span className="flex min-w-0 items-center gap-1.5 sm:col-span-2">
                      <Search className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="truncate">最近页面 {user.analytics?.last_page_path || '-'}</span>
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* 三层确认删除弹窗 */}
        <AnimatePresence>
          {deleteTarget && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 sm:backdrop-blur-sm p-4"
              onClick={closeDeleteModal}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.94, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.94, y: 16 }} transition={{ duration: 0.18 }}
                className="card-block w-full max-w-md p-6"
                onClick={e => e.stopPropagation()}
              >
                <div className="mb-4 flex items-center gap-2">
                  <Trash2 className="h-5 w-5 text-pop-rose flex-shrink-0" />
                  <h2 className="font-display text-xl text-ink dark:text-primary-100">删除用户账号</h2>
                </div>

                {/* 层 1：展示将被删除的内容 */}
                <div className="mb-4 rounded-xl border-2 border-pop-rose/40 bg-pop-rose/5 p-4 text-sm">
                  <p className="font-medium text-ink dark:text-primary-100">{deleteTarget.username}</p>
                  <p className="mt-1 text-ink-muted dark:text-primary-100/60">{deleteTarget.email}</p>
                  <p className="mt-3 text-pop-rose font-medium">⚠ 此操作不可恢复，将同时删除：</p>
                  <ul className="mt-1 list-disc pl-5 text-ink-muted dark:text-primary-100/60 space-y-0.5">
                    <li>账号信息与登录凭据</li>
                    <li>该用户发布的所有活动、店铺、组局</li>
                    <li>收藏记录、评论、访问数据</li>
                  </ul>
                </div>

                {/* 层 2：输入用户名 */}
                <label className="block text-sm font-medium text-ink dark:text-primary-100 mb-1">
                  输入用户名 <span className="font-bold text-pop-rose">{deleteTarget.username}</span> 以确认
                </label>
                <input
                  value={confirmInput}
                  onChange={e => setConfirmInput(e.target.value)}
                  autoFocus
                  autoComplete="off"
                  placeholder="输入用户名"
                  className={`w-full rounded-xl border-3 px-3 py-2 text-sm outline-none focus:ring-3 focus:ring-pop-rose/30 bg-white dark:bg-night-200 text-ink dark:text-primary-100 ${inputMatches ? 'border-pop-rose' : 'border-ink dark:border-night-400'}`}
                />

                {/* 层 3：勾选确认 */}
                <label className="mt-3 flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={confirmChecked}
                    onChange={e => setConfirmChecked(e.target.checked)}
                    className="mt-0.5 h-4 w-4 flex-shrink-0 accent-pop-rose"
                  />
                  <span className="text-sm text-ink-muted dark:text-primary-100/60">我已了解此操作不可恢复，确认删除该用户及其所有数据</span>
                </label>

                {deleteError && (
                  <p className="mt-3 text-sm text-pop-rose">{deleteError}</p>
                )}

                <div className="mt-4 flex gap-3 justify-end">
                  <button type="button" onClick={closeDeleteModal} disabled={deleting} className="btn-secondary !py-2 !px-5 !text-sm">取消</button>
                  <button type="button" onClick={handleDelete} disabled={!canDelete} className="btn-danger !py-2 !px-5 !text-sm">
                    {deleting ? '删除中…' : '确认删除'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </AnimatedPage>
    </div>
  );
};

export default AdminUsers;
