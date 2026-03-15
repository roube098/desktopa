import type { Variants } from 'framer-motion';

// Settings-specific variants
export const settingsVariants = {
  // Panel slide down - for ProviderSettingsPanel
  slideDown: {
    initial: { opacity: 0, y: -12 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 },
  } as Variants,

  // Fade slide - for error messages, warnings
  fadeSlide: {
    initial: { opacity: 0, y: -8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -4 },
  } as Variants,

  // Scale dropdown - for model selector
  scaleDropdown: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
  } as Variants,

  // Stagger for grid expansion
  gridStagger: {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0 },
  } as Variants,
};

// Transition presets for settings
export const settingsTransitions = {
  enter: { duration: 0.2 },
  exit: { duration: 0.15 },
  fast: { duration: 0.1 },
  stagger: (index: number) => ({ duration: 0.2, delay: index * 0.04 }),
};
