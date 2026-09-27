import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';

type BrandVariant = 'shine' | 'breath';

interface AnimatedBrandTextProps {
  variant: BrandVariant;
  className?: string;
}

const LETTERS = ['A', 'n', 'i', 'M', 'a', 'p'];

const prefersReducedMotion = () =>
  typeof window !== 'undefined'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const waitForBrandReady = async (variant: BrandVariant) => {
  if (typeof window === 'undefined') return;

  if ('fonts' in document) {
    try {
      await Promise.race([
        document.fonts.ready,
        new Promise<void>(resolve => window.setTimeout(resolve, 220)),
      ]);
    } catch {
      // Font readiness is a visual enhancement only; animation can still run.
    }
  }

  await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()));
  await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()));

  if (variant === 'shine') {
    await new Promise<void>(resolve => window.setTimeout(resolve, 180));
  }
};

const createWaveLoop = (root: HTMLElement, chars: HTMLElement[], delay = 0) => gsap.timeline({ repeat: -1, repeatDelay: 0.18, delay })
  .to(chars, {
    y: -4.2,
    scale: 1,
    duration: 0.36,
    ease: 'sine.out',
    stagger: { each: 0.07, from: 'start' },
  })
  .to(chars, {
    y: 0,
    scale: 1,
    duration: 0.52,
    ease: 'back.out(1.45)',
    stagger: { each: 0.07, from: 'start' },
  }, 0.24)
  .to(root, {
    filter: 'drop-shadow(0 3px 8px rgba(16, 185, 129, 0.2))',
    duration: 0.36,
    ease: 'sine.inOut',
    yoyo: true,
    repeat: 1,
  }, 0.08);

const playInternalShine = (root: HTMLElement, chars: HTMLElement[], duration = 1.18) => gsap.timeline()
  .set(root, { '--animated-brand-shine-progress': '-140%' })
  .set(chars, { '--animated-brand-shine-opacity': 1 })
  .to(root, {
    '--animated-brand-shine-progress': '140%',
    duration: duration * 0.78,
    ease: 'power2.out',
  })
  .to(chars, {
    '--animated-brand-shine-opacity': 0,
    duration: duration * 0.22,
    ease: 'sine.out',
    stagger: 0.01,
  }, `-=${duration * 0.18}`)
  .set(root, { '--animated-brand-shine-progress': '-140%' });

const AnimatedBrandText: React.FC<AnimatedBrandTextProps> = ({ variant, className = '' }) => {
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const idleTweenRef = useRef<gsap.core.Tween | gsap.core.Timeline | null>(null);
  const reduceMotionRef = useRef(false);

  const getChars = () => {
    if (!rootRef.current) return [];
    return Array.from(rootRef.current.querySelectorAll<HTMLElement>('.animated-brand-char'));
  };

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const perfMode = (() => { try { return localStorage.getItem('animap_perf_mode') === 'on'; } catch { return false; } })();
    const reduce = perfMode || prefersReducedMotion();
    reduceMotionRef.current = reduce;

    let cancelled = false;
    let ctx: gsap.Context | null = null;

    const startAnimation = () => {
      if (cancelled) return;

      ctx = gsap.context(() => {
      const chars = getChars();
      const sweep = root.querySelector<HTMLElement>('.animated-brand-sweep');
      gsap.set([root, ...chars, sweep].filter(Boolean), { clearProps: 'all' });

      if (reduce) return;

      if (variant === 'shine') {
        const timeline = gsap.timeline();
        timeline
          .fromTo(chars, {
            autoAlpha: 0,
            y: 16,
            filter: 'blur(5px)',
          }, {
            autoAlpha: 1,
            y: 0,
            filter: 'blur(0px)',
            duration: 0.52,
            ease: 'power3.out',
            stagger: 0.035,
          })
          .add(playInternalShine(root, chars, 1.18), 0.08)
          .fromTo(
            root,
            { filter: 'drop-shadow(0 0 0 rgba(16, 185, 129, 0))' },
            {
              filter: 'drop-shadow(0 0 12px rgba(103, 232, 249, 0.42)) drop-shadow(0 8px 18px rgba(16, 185, 129, 0.22))',
              duration: 0.38,
              yoyo: true,
              repeat: 1,
              ease: 'power2.out',
            },
            0.2,
          );

        idleTweenRef.current = createWaveLoop(root, chars, 1.42);
        return;
      }

      const enter = gsap.timeline();
      enter.fromTo(chars, {
        autoAlpha: 0,
        scale: 0.94,
        y: 5,
      }, {
        autoAlpha: 1,
        scale: 1,
        y: 0,
        duration: 0.42,
        ease: 'power3.out',
        stagger: 0.035,
      });

      idleTweenRef.current = createWaveLoop(root, chars, 0.72);
      }, root);
    };

    const chars = getChars();
    const sweep = root.querySelector<HTMLElement>('.animated-brand-sweep');
    if (!reduce) {
      gsap.set(chars, { autoAlpha: 0 });
      // sweep 仅在 shine 变体下渲染；breath 变体时为 null，跳过避免 GSAP "target null" 警告
      if (sweep) gsap.set(sweep, { autoAlpha: 0, xPercent: -130 });
    }

    waitForBrandReady(variant).then(startAnimation);

    return () => {
      cancelled = true;
      idleTweenRef.current = null;
      ctx?.revert();
    };
  }, [variant]);

  const handlePointerEnter = () => {
    if (reduceMotionRef.current) return;
    const root = rootRef.current;
    if (!root) return;

    const chars = getChars();

    if (variant === 'shine') {
      playInternalShine(root, chars, 0.96);
      gsap.fromTo(root,
        { filter: 'drop-shadow(0 0 0 rgba(103, 232, 249, 0))' },
        { filter: 'drop-shadow(0 0 10px rgba(103, 232, 249, 0.38))', duration: 0.26, ease: 'power2.out', yoyo: true, repeat: 1 },
      );
      gsap.fromTo(
        chars,
        { y: 0 },
        { y: -4, scale: 1.035, duration: 0.26, ease: 'back.out(3)', stagger: 0.018, yoyo: true, repeat: 1 },
      );
      return;
    }

    idleTweenRef.current?.pause();
    gsap.fromTo(
      chars,
      { y: 0 },
      {
        y: -3.6,
        scale: 1.026,
        duration: 0.3,
        ease: 'back.out(1.8)',
        stagger: 0.016,
        yoyo: true,
        repeat: 1,
        onComplete: () => idleTweenRef.current?.resume(),
      },
    );
  };

  return (
    <span
      ref={rootRef}
      className={`animated-brand animated-brand-${variant} ${className}`}
      aria-label="AniMap"
      onPointerEnter={handlePointerEnter}
    >
      {LETTERS.map((letter, index) => (
        <span
          key={`${letter}-${index}`}
          aria-hidden="true"
          className="animated-brand-char"
          data-letter={letter}
        >
          {letter}
        </span>
      ))}
      {variant === 'shine' && <span className="animated-brand-sweep" aria-hidden="true" />}
    </span>
  );
};

export default AnimatedBrandText;
