import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MapPin, Phone, Clock, FileText, Navigation, ChevronLeft, ChevronRight } from 'lucide-react';
import { venueService } from '../services/venueService';
import { Venue } from '../types';
import { getImageUrl } from '../utils/helpers';
import NavHeader from '../components/NavHeader';
import AnimatedPage from '../components/AnimatedPage';
import LoadingSpinner from '../components/LoadingSpinner';
import NavMenu from '../components/NavMenu';

const VenueDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [venue, setVenue] = useState<Venue | null>(null);
  const [loading, setLoading] = useState(true);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [navMenuOpen, setNavMenuOpen] = useState(false);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    venueService.getVenueById(Number(id))
      .then(r => setVenue(r.venue))
      .catch(() => setVenue(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="min-h-screen bg-primary-50 dark:bg-night-200 flex items-center justify-center"><LoadingSpinner size="lg" text="加载店铺..." /></div>;
  }

  if (!venue) {
    return (
      <div className="min-h-screen bg-primary-50 dark:bg-night-200">
        <NavHeader title="店铺详情" backTo="/" />
        <div className="flex items-center justify-center py-32">
          <p className="font-display text-xl text-ink-muted dark:text-primary-100/60">店铺不存在或已下架</p>
        </div>
      </div>
    );
  }

  const photos = venue.nav_photos || [];
  const safePhotoIndex = photos.length > 0 ? Math.min(photoIndex, photos.length - 1) : 0;
  const navGuideLines = venue.nav_guide ? venue.nav_guide.split('\n').filter(l => l.trim()) : [];

  return (
    <div className="min-h-screen bg-primary-50 dark:bg-night-200">
      <NavHeader title={venue.name} backTo="/" />
      <AnimatedPage>
        <div className="container mx-auto p-4 sm:p-6 max-w-2xl space-y-5">

          {/* 封面 + 基本信息 */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card-block overflow-hidden">
            {venue.cover_url && (
              <div className="aspect-[16/9] overflow-hidden border-b-3 border-ink dark:border-night-400">
                <img src={getImageUrl(venue.cover_url)} alt={venue.name} className="w-full h-full object-cover" />
              </div>
            )}
            <div className="p-5 space-y-3">
              <h1 className="font-display text-2xl text-ink dark:text-primary-100 tracking-wide">{venue.name}</h1>

              {[
                venue.address && { icon: MapPin, color: 'bg-action', label: '地址', value: venue.address },
                venue.phone && { icon: Phone, color: 'bg-pop-purple', label: '电话', value: venue.phone },
                venue.business_hours && { icon: Clock, color: 'bg-pop-yellow', label: '营业时间', value: venue.business_hours },
                venue.description && { icon: FileText, color: 'bg-pop-cyan', label: '简介', value: venue.description },
              ].filter(Boolean).map((item: any, i) => {
                const Icon = item.icon;
                return (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-primary-50 dark:bg-night-200 border-2 border-ink/10 dark:border-night-400">
                    <div className={`flex-shrink-0 w-9 h-9 rounded-lg ${item.color} border-2 border-ink dark:border-night-400 flex items-center justify-center`}>
                      <Icon className="w-4 h-4 text-ink" strokeWidth={2.5} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-[11px] font-display text-ink-muted dark:text-primary-100/60 uppercase tracking-wider">{item.label}</span>
                      <p className="text-sm text-ink dark:text-primary-100 font-medium mt-0.5 break-words">{item.value}</p>
                    </div>
                  </div>
                );
              })}

              {/* 高德导航按钮 */}
              <button onClick={() => setNavMenuOpen(true)} className="btn-action w-full !py-3 mt-2">
                <Navigation className="w-5 h-5" />
                导航到这里
              </button>
            </div>
          </motion.div>

          {/* 最后100米怎么走 */}
          {(navGuideLines.length > 0 || photos.length > 0) && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="card-block p-5">
              <h2 className="font-display text-lg text-ink dark:text-primary-100 mb-4 flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-pop-yellow border-2 border-ink dark:border-night-400 flex items-center justify-center text-base">🧭</span>
                最后100米怎么走
              </h2>

              {/* 文字步骤 */}
              {navGuideLines.length > 0 && (
                <ol className="space-y-2 mb-5">
                  {navGuideLines.map((line, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-action border-2 border-ink dark:border-night-400 flex items-center justify-center text-xs font-display text-white">
                        {i + 1}
                      </span>
                      <p className="text-sm text-ink dark:text-primary-100 pt-0.5">{line.replace(/^\d+[.、]\s*/, '')}</p>
                    </li>
                  ))}
                </ol>
              )}

              {/* 导航图片轮播 */}
              {photos.length > 0 && (
                <div className="relative">
                  <div className="aspect-[4/3] rounded-xl overflow-hidden border-3 border-ink dark:border-night-400 shadow-block-sm">
                    <img src={getImageUrl(photos[safePhotoIndex].photo_url)} alt={photos[safePhotoIndex].caption || ''} className="w-full h-full object-cover" />
                    {photos[safePhotoIndex].caption && (
                      <div className="absolute bottom-0 inset-x-0 bg-ink/70 px-3 py-2">
                        <p className="text-sm text-white font-medium">{photos[safePhotoIndex].caption}</p>
                      </div>
                    )}
                  </div>

                  {photos.length > 1 && (
                    <>
                      <button onClick={() => setPhotoIndex(i => (i - 1 + photos.length) % photos.length)}
                        className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl bg-white/90 border-2 border-ink flex items-center justify-center shadow-block-sm hover:-translate-y-1/2 hover:shadow-block transition-all">
                        <ChevronLeft className="w-5 h-5 text-ink" />
                      </button>
                      <button onClick={() => setPhotoIndex(i => (i + 1) % photos.length)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl bg-white/90 border-2 border-ink flex items-center justify-center shadow-block-sm hover:-translate-y-1/2 hover:shadow-block transition-all">
                        <ChevronRight className="w-5 h-5 text-ink" />
                      </button>
                      <div className="flex justify-center gap-1.5 mt-3">
                        {photos.map((_, i) => (
                          <button key={i} onClick={() => setPhotoIndex(i)}
                            className={`w-2 h-2 rounded-full border border-ink transition-all ${i === safePhotoIndex ? 'bg-action w-4' : 'bg-ink/20'}`} />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </motion.div>
          )}

        </div>
      </AnimatedPage>

      <NavMenu
        lat={Number(venue.latitude)}
        lng={Number(venue.longitude)}
        name={venue.name}
        open={navMenuOpen}
        onClose={() => setNavMenuOpen(false)}
      />
    </div>
  );
};

export default VenueDetail;
