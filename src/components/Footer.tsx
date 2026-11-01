import React from 'react';

/**
 * Small, unobtrusive brand footer.
 * Shown on the sign-in screen and at the bottom of the signed-in app.
 */
export const Footer: React.FC<{ className?: string }> = ({ className = '' }) => (
  <footer
    className={`text-center text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400 ${className}`}
  >
    <p>
      Made by{' '}
      <span className="font-medium text-neutral-700 dark:text-neutral-300">
        Ishizaki Tech Services
      </span>
    </p>
    <p className="mt-0.5">
      Powered by Ishizaki &copy; 2026 &middot;{' '}
      <a
        href="mailto:ishizakitechservices@gmail.com"
        className="hover:text-neutral-900 dark:hover:text-neutral-100 underline-offset-2 hover:underline"
      >
        ishizakitechservices@gmail.com
      </a>
    </p>
  </footer>
);
