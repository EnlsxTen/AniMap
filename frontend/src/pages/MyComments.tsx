import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Calendar, MapPin, MessageCircle, Trash2 } from 'lucide-react';
import { eventService } from '../services/eventService';
import { MyEventComment } from '../types';
import { formatDate, getApiErrorMessage, getImageUrl } from '../utils/helpers';
import AnimatedPage from '../components/AnimatedPage';
import LoadingSpinner from '../components/LoadingSpinner';
import NavHeader from '../components/NavHeader';
import ScrollToTop from '../components/ScrollToTop';

const MyComments: React.FC = () => {
  const [comments, setComments] = useState<MyEventComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    eventService.getMyEventComments()
      .then(res => setComments(res.comments))
      .catch(err => setError(getApiErrorMessage(err, '加载弹幕失败')))
      .finally(() => setLoading(false));
  }, []);

  const totalEvents = useMemo(() => new Set(comments.map(item => item.event_id)).size, [comments]);

  const handleDelete = async (comment: MyEventComment) => {
    if (!window.confirm('确定删除这条弹幕吗？')) return;
    setDeletingId(comment.id);
    setError('');
    try {
      await eventService.deleteMyEventComment(comment.id);
      setComments(prev => prev.filter(item => item.id !== comment.id));
    } catch (err) {
      setError(getApiErrorMessage(err, '删除弹幕失败'));
    } finally {
      setDeletingId(null);
    }
  };

  const handleOpenEvent = (comment: MyEventComment) => {
    navigate(`/?focus=event-${comment.event_id}`);
  };

  return (
    <div className="min-h-screen bg-primary-50 dark:bg-night-200">
      <NavHeader title="我的弹幕" backTo="/" />
      <AnimatedPage>
        <div className="container mx-auto max-w-3xl p-4 sm:p-6">
          <div className="mb-5 grid grid-cols-2 gap-3">
            <div className="card-block p-4">
              <p className="text-xs font-display text-ink-muted dark:text-primary-100/60">发送弹幕</p>
              <p className="mt-1 font-display text-3xl text-ink dark:text-primary-100">{comments.length}</p>
            </div>
            <div className="card-block p-4">
              <p className="text-xs font-display text-ink-muted dark:text-primary-100/60">关联展会</p>
              <p className="mt-1 font-display text-3xl text-ink dark:text-primary-100">{totalEvents}</p>
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border-2 border-pop-rose bg-pop-rose/15 px-4 py-3 text-sm font-medium text-pop-rose">
              {error}
            </div>
          )}

          {loading ? (
            <div className="py-20"><LoadingSpinner size="lg" text="加载弹幕..." /></div>
          ) : comments.length === 0 ? (
            <div className="card-block p-12 text-center">
              <MessageCircle className="mx-auto mb-3 h-12 w-12 text-ink-muted" strokeWidth={1.6} />
              <p className="font-display text-xl text-ink dark:text-primary-100">还没有发送过弹幕</p>
              <p className="mt-2 text-sm text-ink-muted dark:text-primary-100/60">在活动标签页发表评论后，会在这里管理。</p>
            </div>
          ) : (
            <div className="space-y-3">
              <AnimatePresence>
                {comments.map((comment, index) => (
                  <motion.div
                    key={comment.id}
                    initial={{ opacity: 0, y: 18, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 80, scale: 0.96 }}
                    transition={{ type: 'spring', damping: 24, stiffness: 430, delay: index * 0.025 }}
                    className="card-block overflow-hidden"
                  >
                    <div className="flex gap-3 p-4">
                      <button
                        type="button"
                        onClick={() => handleOpenEvent(comment)}
                        className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl border-3 border-ink bg-primary-100 shadow-block-sm dark:border-night-400 dark:bg-night-200"
                        aria-label="回到对应活动"
                      >
                        <img src={getImageUrl(comment.event_poster_url, 'preview')} alt={comment.event_name} className="h-full w-full object-cover" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEvent(comment)}
                          className="block max-w-full text-left font-display text-base text-ink transition-colors hover:text-action dark:text-primary-100"
                        >
                          <span className="block truncate">{comment.event_name}</span>
                        </button>
                        <p className="mt-1 flex items-center gap-1 text-xs text-ink-muted dark:text-primary-100/60">
                          <Calendar className="h-3 w-3" />{formatDate(comment.event_start_time)}
                        </p>
                        <div className="mt-3 rounded-xl border-2 border-ink/10 bg-primary-50 px-3 py-2 text-sm text-ink dark:border-night-400 dark:bg-night-200 dark:text-primary-100">
                          <span className="font-display">{comment.username}：</span>{comment.content}
                        </div>
                        <p className="mt-2 flex items-center gap-1 text-xs text-ink-muted dark:text-primary-100/60">
                          <MapPin className="h-3 w-3 text-action" />发送于 {formatDate(comment.created_at)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDelete(comment)}
                        disabled={deletingId === comment.id}
                        className="h-11 w-11 flex-shrink-0 rounded-xl border-2 border-pop-rose/30 bg-pop-rose/10 text-pop-rose transition-all duration-200 hover:bg-pop-rose hover:text-white disabled:opacity-60"
                        aria-label="删除弹幕"
                        title="删除弹幕"
                      >
                        <Trash2 className="mx-auto h-5 w-5" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </AnimatedPage>
      <ScrollToTop />
    </div>
  );
};

export default MyComments;
