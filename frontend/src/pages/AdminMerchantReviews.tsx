import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Trash2, Mail, Phone, Clock, Users, ClipboardCheck, MapPin, Store } from 'lucide-react';
import { authService } from '../services/authService';
import { eventService } from '../services/eventService';
import { venueService } from '../services/venueService';
import { MerchantReviewUser, Event, Venue } from '../types';
import { formatDate, getApiErrorMessage, getImageUrl } from '../utils/helpers';
import AnimatedPage from '../components/AnimatedPage';
import NavHeader from '../components/NavHeader';
import LoadingSpinner from '../components/LoadingSpinner';

type TabType = 'merchants' | 'events' | 'venues';

const AdminMerchantReviews: React.FC = () => {
  const [merchants, setMerchants] = useState<MerchantReviewUser[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('merchants');
  // 审核备注弹窗：通过/拒绝活动或店铺时填写备注（拒绝建议填，通过可选），随审核结果邮件回传给提交者
  const [reviewModal, setReviewModal] = useState<{
    kind: 'event' | 'venue';
    id: number;
    status: 'approved' | 'rejected';
    name: string;
  } | null>(null);
  const [reviewNote, setReviewNote] = useState('');

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true); setError('');
    try {
      const [mRes, eRes, vRes] = await Promise.all([
        authService.getPendingMerchants(),
        eventService.getPendingEvents(),
        venueService.getPendingVenues(),
      ]);
      const m = mRes.merchants;
      const e = eRes.events;
      const v = vRes.venues;
      setMerchants(m);
      setEvents(e);
      setVenues(v);
      // 默认激活待审核数量最多的 Tab
      const counts = { merchants: m.length, events: e.length, venues: v.length };
      const max = (Object.keys(counts) as TabType[]).reduce((a, b) => counts[a] >= counts[b] ? a : b);
      setActiveTab(max);
    } catch (err) {
      setError(getApiErrorMessage(err, '加载审核数据失败'));
    } finally {
      setLoading(false);
    }
  };

  const handleMerchantReview = async (id: number, status: 'approved' | 'rejected') => {
    setProcessingId(id);
    try {
      await authService.updateMerchantApproval(id, status);
      setMerchants(c => c.filter(m => m.id !== id));
    } catch (err) { setError(getApiErrorMessage(err, '操作失败')); }
    finally { setProcessingId(null); }
  };

  const handleEventReview = async (id: number, status: 'approved' | 'rejected', note?: string) => {
    setProcessingId(id);
    try {
      await eventService.updateEventStatus(id, status, note);
      setEvents(c => c.filter(e => e.id !== id));
    } catch (err) { setError(getApiErrorMessage(err, '操作失败')); }
    finally { setProcessingId(null); }
  };

  const handleEventDelete = async (id: number) => {
    if (!window.confirm('确定要删除这个活动吗？')) return;
    setProcessingId(id);
    try {
      await eventService.deleteEvent(id);
      setEvents(c => c.filter(e => e.id !== id));
    } catch (err) { setError(getApiErrorMessage(err, '删除失败')); }
    finally { setProcessingId(null); }
  };

  const handleVenueReview = async (id: number, status: 'approved' | 'rejected', note?: string) => {
    setProcessingId(id);
    try {
      await venueService.updateVenueStatus(id, status, note);
      setVenues(c => c.filter(v => v.id !== id));
    } catch (err) { setError(getApiErrorMessage(err, '操作失败')); }
    finally { setProcessingId(null); }
  };

  const handleVenueDelete = async (id: number) => {
    if (!window.confirm('确定要删除这个店铺吗？')) return;
    setProcessingId(id);
    try {
      await venueService.deleteVenue(id);
      setVenues(c => c.filter(v => v.id !== id));
    } catch (err) { setError(getApiErrorMessage(err, '删除失败')); }
    finally { setProcessingId(null); }
  };

  // 打开备注弹窗（活动/店铺的通过或拒绝）
  const openReviewModal = (kind: 'event' | 'venue', id: number, status: 'approved' | 'rejected', name: string) => {
    setReviewNote('');
    setReviewModal({ kind, id, status, name });
  };

  // 确认审核：带备注提交，成功后关闭弹窗
  const confirmReview = async () => {
    if (!reviewModal) return;
    const note = reviewNote.trim();
    const { kind, id, status } = reviewModal;
    if (kind === 'event') {
      await handleEventReview(id, status, note || undefined);
    } else {
      await handleVenueReview(id, status, note || undefined);
    }
    setReviewModal(null);
    setReviewNote('');
  };

  const tabs: { key: TabType; label: string; count: number; color: string }[] = [
    { key: 'merchants', label: '商户审核', count: merchants.length, color: 'bg-pop-purple' },
    { key: 'events',    label: '活动审核', count: events.length,    color: 'bg-pop-yellow' },
    { key: 'venues',    label: '店铺审核', count: venues.length,    color: 'bg-pop-cyan' },
  ];

  const ReviewActions = ({ id, onApprove, onReject, onDelete }: {
    id: number; onApprove: () => void; onReject: () => void; onDelete?: () => void;
  }) => (
    <div className="flex gap-2 flex-shrink-0 sm:flex-col">
      <button type="button" disabled={processingId === id} onClick={onApprove} className="btn-primary !py-2 !px-4 !text-sm">
        <Check className="w-4 h-4" /> 通过
      </button>
      <button type="button" disabled={processingId === id} onClick={onReject} className="btn-secondary !py-2 !px-4 !text-sm">
        <X className="w-4 h-4" /> 拒绝
      </button>
      {onDelete && (
        <button type="button" disabled={processingId === id} onClick={onDelete} className="btn-danger !py-2 !px-3 !text-sm">
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-primary-50 dark:bg-night-200">
      <NavHeader title="审核后台" backTo="/" />
      <AnimatedPage>
        <div className="container mx-auto p-4 sm:p-6 max-w-4xl">

          {/* Tab 切换 */}
          <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
            {tabs.map(t => (
              <button key={t.key} type="button" onClick={() => setActiveTab(t.key)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-display text-sm border-3 transition-all duration-200 whitespace-nowrap ${
                  activeTab === t.key
                    ? 'bg-action text-white border-ink shadow-block-sm'
                    : 'bg-white dark:bg-night-100 text-ink dark:text-primary-100 border-ink dark:border-night-400 hover:bg-primary-50 dark:hover:bg-night-50'
                }`}>
                {t.label}
                {t.count > 0 && (
                  <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold ${
                    activeTab === t.key ? 'bg-white text-action' : `${t.color} text-ink border border-ink`
                  }`}>
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-pop-rose/15 border-2 border-pop-rose text-sm text-pop-rose font-medium">{error}</div>
          )}

          {loading ? (
            <div className="py-20"><LoadingSpinner size="lg" text="加载中..." /></div>
          ) : (
            <>
              {/* 商户审核 */}
              {activeTab === 'merchants' && (
                merchants.length === 0 ? (
                  <div className="card-block p-12 text-center">
                    <Users className="w-12 h-12 mx-auto text-ink-muted mb-3" strokeWidth={1.5} />
                    <p className="font-display text-xl text-ink dark:text-primary-100">暂无待审核商户</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <AnimatePresence>
                      {merchants.map((m, i) => (
                        <motion.div key={m.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: 80, transition: { duration: 0.2 } }} transition={{ delay: i * 0.05 }}
                          className="card-block overflow-hidden flex">
                          <div className="w-2 bg-pop-purple border-r-3 border-ink dark:border-night-400 flex-shrink-0" />
                          <div className="flex-1 p-5">
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                              <div className="space-y-2 flex-1 min-w-0">
                                <div className="flex items-center gap-3">
                                  <div className="w-11 h-11 rounded-xl bg-pop-purple border-3 border-ink dark:border-night-400 shadow-block-sm flex items-center justify-center text-white flex-shrink-0">
                                    <span className="font-display text-base">{m.username.charAt(0).toUpperCase()}</span>
                                  </div>
                                  <div className="min-w-0">
                                    <h2 className="font-display text-base text-ink dark:text-primary-100 truncate">{m.username}</h2>
                                    <p className="text-xs text-ink-muted dark:text-primary-100/60">{m.created_at ? formatDate(m.created_at) : ''}</p>
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-3 text-sm">
                                  <span className="flex items-center gap-1.5 text-ink-muted dark:text-primary-100/70"><Mail className="w-3.5 h-3.5 text-action" />{m.email}</span>
                                  <span className="flex items-center gap-1.5 text-ink-muted dark:text-primary-100/70"><Phone className="w-3.5 h-3.5 text-pop-purple" />{m.phone || '未填写'}</span>
                                </div>
                              </div>
                              <ReviewActions id={m.id}
                                onApprove={() => handleMerchantReview(m.id, 'approved')}
                                onReject={() => handleMerchantReview(m.id, 'rejected')} />
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )
              )}

              {/* 活动审核 */}
              {activeTab === 'events' && (
                events.length === 0 ? (
                  <div className="card-block p-12 text-center">
                    <ClipboardCheck className="w-12 h-12 mx-auto text-ink-muted mb-3" strokeWidth={1.5} />
                    <p className="font-display text-xl text-ink dark:text-primary-100">暂无待审核活动</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <AnimatePresence>
                      {events.map((ev, i) => (
                        <motion.div key={ev.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: 80, transition: { duration: 0.2 } }} transition={{ delay: i * 0.05 }}
                          className="card-block overflow-hidden flex">
                          <div className="w-2 bg-pop-yellow border-r-3 border-ink dark:border-night-400 flex-shrink-0" />
                          <div className="flex-1 p-5">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                              <div className="flex gap-3 flex-1 min-w-0">
                                <img src={getImageUrl(ev.poster_url, 'thumb')} alt={ev.name}
                                  className="w-20 h-20 rounded-xl object-cover flex-shrink-0 border-3 border-ink dark:border-night-400 shadow-block-sm" />
                                <div className="space-y-1 min-w-0 flex-1">
                                  <h2 className="font-display text-base text-ink dark:text-primary-100 truncate">{ev.name}</h2>
                                  <p className="text-xs text-ink-muted dark:text-primary-100/60">发布者：{ev.merchant_name || '未知'}</p>
                                  <p className="text-sm text-ink-muted dark:text-primary-100/70 flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-action flex-shrink-0" />{ev.venue_name}</p>
                                  <p className="text-xs text-ink-muted dark:text-primary-100/60 flex items-center gap-1"><Clock className="w-3.5 h-3.5 flex-shrink-0" />{formatDate(ev.start_time)}</p>
                                </div>
                              </div>
                              <ReviewActions id={ev.id}
                                onApprove={() => openReviewModal('event', ev.id, 'approved', ev.name)}
                                onReject={() => openReviewModal('event', ev.id, 'rejected', ev.name)}
                                onDelete={() => handleEventDelete(ev.id)} />
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )
              )}

              {/* 店铺审核 */}
              {activeTab === 'venues' && (
                venues.length === 0 ? (
                  <div className="card-block p-12 text-center">
                    <Store className="w-12 h-12 mx-auto text-ink-muted mb-3" strokeWidth={1.5} />
                    <p className="font-display text-xl text-ink dark:text-primary-100">暂无待审核店铺</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <AnimatePresence>
                      {venues.map((v, i) => (
                        <motion.div key={v.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: 80, transition: { duration: 0.2 } }} transition={{ delay: i * 0.05 }}
                          className="card-block overflow-hidden flex">
                          <div className="w-2 bg-pop-cyan border-r-3 border-ink dark:border-night-400 flex-shrink-0" />
                          <div className="flex-1 p-5">
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                              <div className="flex gap-3 flex-1 min-w-0">
                                {v.cover_url
                                  ? <img src={getImageUrl(v.cover_url, 'thumb')} alt={v.name} className="w-16 h-16 rounded-xl object-cover flex-shrink-0 border-3 border-ink dark:border-night-400 shadow-block-sm" />
                                  : <div className="w-16 h-16 rounded-xl bg-pop-cyan/20 border-3 border-ink dark:border-night-400 flex items-center justify-center flex-shrink-0"><Store className="w-7 h-7 text-pop-cyan" /></div>
                                }
                                <div className="space-y-1 min-w-0 flex-1">
                                  <h2 className="font-display text-base text-ink dark:text-primary-100 truncate">{v.name}</h2>
                                  <p className="text-xs text-ink-muted dark:text-primary-100/60">提交者：{v.owner_name || '未知'}</p>
                                  <p className="text-sm text-ink-muted dark:text-primary-100/70 flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-action flex-shrink-0" /><span className="truncate">{v.address}</span></p>
                                  {v.business_hours && <p className="text-xs text-ink-muted dark:text-primary-100/60 flex items-center gap-1"><Clock className="w-3.5 h-3.5 flex-shrink-0" />{v.business_hours}</p>}
                                </div>
                              </div>
                              <ReviewActions id={v.id}
                                onApprove={() => openReviewModal('venue', v.id, 'approved', v.name)}
                                onReject={() => openReviewModal('venue', v.id, 'rejected', v.name)}
                                onDelete={() => handleVenueDelete(v.id)} />
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )
              )}
            </>
          )}
        </div>

        {/* 审核备注弹窗：通过/拒绝活动或店铺时填备注，随结果邮件回传提交者 */}
        <AnimatePresence>
          {reviewModal && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 sm:backdrop-blur-sm p-4"
              onClick={() => { if (processingId === null) { setReviewModal(null); setReviewNote(''); } }}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.94, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.94, y: 16 }} transition={{ duration: 0.18 }}
                className="card-block w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}
              >
                <h2 className="font-display text-xl text-ink dark:text-primary-100 mb-1">
                  {reviewModal.status === 'approved' ? '通过审核' : '拒绝审核'}
                </h2>
                <p className="text-sm text-ink-muted dark:text-primary-100/60 mb-4 truncate">
                  {reviewModal.kind === 'event' ? '活动' : '店铺'}：{reviewModal.name}
                </p>
                <label className="block text-sm font-medium text-ink dark:text-primary-100 mb-2">
                  备注{reviewModal.status === 'rejected' ? '（建议填写拒绝原因）' : '（可选）'}
                </label>
                <textarea
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  maxLength={1000}
                  rows={4}
                  autoFocus
                  placeholder={reviewModal.status === 'rejected' ? '例如：海报不清晰，请重新上传后提交' : '可填写给提交者的说明，留空则不附备注'}
                  className="w-full rounded-xl border-3 border-ink dark:border-night-400 bg-white dark:bg-night-200 px-3 py-2.5 text-sm text-ink dark:text-primary-100 outline-none focus:ring-3 focus:ring-action/30 resize-none"
                />
                <div className="mt-2 text-right text-xs text-ink-muted dark:text-primary-100/50">{reviewNote.length}/1000</div>
                <div className="mt-4 flex gap-3 justify-end">
                  <button
                    type="button"
                    onClick={() => { setReviewModal(null); setReviewNote(''); }}
                    disabled={processingId !== null}
                    className="btn-secondary !py-2 !px-5 !text-sm"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={confirmReview}
                    disabled={processingId !== null}
                    className={reviewModal.status === 'approved' ? 'btn-primary !py-2 !px-5 !text-sm' : 'btn-danger !py-2 !px-5 !text-sm'}
                  >
                    {reviewModal.status === 'approved' ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                    确认{reviewModal.status === 'approved' ? '通过' : '拒绝'}
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

export default AdminMerchantReviews;
