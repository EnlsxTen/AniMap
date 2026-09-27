import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Calendar, Gamepad2, Plus, Store } from 'lucide-react';
import gsap from 'gsap';

type PublishAction = {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  color: string;
};

type FloatingPublishMenuProps = {
  isAuthenticated: boolean;
  onNavigate: (to: string) => void;
};

const publishActions: PublishAction[] = [
  { label: '发布活动', to: '/merchant/create', icon: Calendar, color: 'bg-action' },
  { label: '发布商铺', to: '/merchant/venue/create', icon: Store, color: 'bg-pop-purple' },
  { label: '发布组局', to: '/merchant/session/create', icon: Gamepad2, color: 'bg-blue-600' },
];

export function FloatingPublishMenu({ isAuthenticated, onNavigate }: FloatingPublishMenuProps) {
  const [open, setOpen] = useState(false);
  const fabRef = useRef<HTMLButtonElement | null>(null);
  const actionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleAction = useCallback((to: string) => {
    setOpen(false);
    onNavigate(isAuthenticated ? to : '/login');
  }, [isAuthenticated, onNavigate]);

  useLayoutEffect(() => {
    const items = actionRefs.current.filter(Boolean);
    const button = fabRef.current;
    const launchOffsets = items.map((_, index) => 74 + index * 66);

    gsap.killTweensOf([button, ...items]);
    const timeline = gsap.timeline();

    if (open) {
      timeline
        .set(items, {
          autoAlpha: 0,
          x: 46,
          y: (index) => launchOffsets[index],
          scale: 0.12,
          rotate: 22,
          transformOrigin: '100% 100%',
        }, 0)
        .to(button, {
          rotate: 36,
          scaleX: 1.18,
          scaleY: 0.84,
          duration: 0.1,
          ease: 'power3.out',
        }, 0)
        .to(button, {
          rotate: 45,
          scaleX: 1,
          scaleY: 1,
          duration: 0.58,
          ease: 'elastic.out(1.35, 0.42)',
        }, 0.08);

      items.forEach((item, index) => {
        timeline
          .to(item, {
            autoAlpha: 1,
            x: -10,
            y: -8,
            scaleX: 1.08,
            scaleY: 0.92,
            rotate: -3,
            duration: 0.25,
            ease: 'power3.out',
          }, 0.04 + index * 0.065)
          .to(item, {
            x: 0,
            y: 0,
            scaleX: 1,
            scaleY: 1,
            rotate: 0,
            duration: 0.55,
            ease: 'elastic.out(1.15, 0.52)',
          }, 0.22 + index * 0.065);
      });
    } else {
      timeline
        .to(button, {
          rotate: 0,
          scaleX: 0.9,
          scaleY: 1.12,
          duration: 0.1,
          ease: 'power3.out',
        }, 0)
        .to(button, {
          scaleX: 1,
          scaleY: 1,
          duration: 0.32,
          ease: 'elastic.out(1, 0.55)',
        }, 0.08);

      [...items].reverse().forEach((item, reverseIndex) => {
        const index = items.indexOf(item);
        timeline
          .to(item, {
            x: -7,
            y: -7,
            scaleX: 1.06,
            scaleY: 0.94,
            rotate: -2,
            duration: 0.08,
            ease: 'power2.out',
          }, reverseIndex * 0.035)
          .to(item, {
            autoAlpha: 0,
            x: 48,
            y: launchOffsets[index],
            scale: 0.16,
            rotate: 18,
            duration: 0.22,
            ease: 'power3.in',
          }, 0.08 + reverseIndex * 0.035);
      });
    }
  }, [open]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="pointer-events-auto relative flex flex-col items-end gap-3">
      <div
        className={`absolute bottom-[4.5rem] right-0 z-20 flex flex-col-reverse items-end gap-3 ${open ? 'pointer-events-auto' : 'pointer-events-none'}`}
        aria-hidden={!open}
        role="menu"
      >
        {publishActions.map((action, index) => {
          const Icon = action.icon;
          return (
            <button
              key={action.to}
              ref={(node) => { actionRefs.current[index] = node; }}
              type="button"
              role="menuitem"
              tabIndex={open ? 0 : -1}
              onClick={() => handleAction(action.to)}
              className="group flex min-w-[136px] origin-bottom-right items-center justify-between gap-3 rounded-2xl border-3 border-ink bg-white px-3 py-2.5 text-sm font-display text-ink shadow-block-sm outline-none transition-shadow duration-200 hover:shadow-block focus-visible:ring-3 focus-visible:ring-action/40 dark:border-night-400 dark:bg-night-100 dark:text-primary-100"
              style={{ opacity: 0, visibility: 'hidden', transform: 'translateY(16px) scale(0.82)' }}
            >
              <span>{action.label}</span>
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl border-2 border-ink text-white shadow-block-sm ${action.color}`}>
                <Icon className="h-5 w-5" strokeWidth={2.5} />
              </span>
            </button>
          );
        })}
      </div>

      {open && (
        <button
          type="button"
          className="fixed inset-0 z-10 cursor-default"
          aria-label="关闭发布菜单"
          onClick={() => setOpen(false)}
        />
      )}

      <button
        ref={fabRef}
        type="button"
        onClick={() => setOpen(value => !value)}
        className="pointer-events-auto relative z-30 flex h-14 w-14 items-center justify-center rounded-2xl border-3 border-ink bg-action text-white shadow-block outline-none transition-shadow duration-200 hover:-translate-y-1 hover:shadow-block-lg focus-visible:ring-3 focus-visible:ring-action/40 dark:border-night-400"
        aria-label={open ? '关闭发布菜单' : '打开发布菜单'}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Plus className="h-7 w-7" strokeWidth={3} />
      </button>
    </div>
  );
}
