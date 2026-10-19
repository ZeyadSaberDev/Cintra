import type { Transition, Variants } from 'motion/react';

export const motionTiming = {
  micro: 0.16,
  component: 0.22,
  panel: 0.28,
  page: 0.34,
  ease: [0.2, 0.8, 0.2, 1] as const,
} as const;

export function getMotionTransition(reduceMotion: boolean, duration: number = motionTiming.component): Transition {
  return reduceMotion
    ? { duration: 0.01 }
    : { duration, ease: motionTiming.ease };
}

export function getEntranceVariants(reduceMotion: boolean): Variants {
  return {
    hidden: reduceMotion ? { opacity: 1 } : { opacity: 0, y: 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: getMotionTransition(reduceMotion, motionTiming.page),
    },
  };
}

export function getStaggerVariants(reduceMotion: boolean): Variants {
  return {
    hidden: {},
    visible: {
      transition: reduceMotion
        ? { duration: 0.01 }
        : { staggerChildren: 0.055, delayChildren: 0.04 },
    },
  };
}

export function getStaggerChildVariants(reduceMotion: boolean): Variants {
  return {
    hidden: reduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 },
    visible: {
      opacity: 1,
      y: 0,
      transition: getMotionTransition(reduceMotion, motionTiming.component),
    },
  };
}
