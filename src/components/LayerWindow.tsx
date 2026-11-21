import React, { useEffect, useId } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { triggerHaptic } from '../lib/nativeBridge';

export interface LayerWindowProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  layerLevel?: 1 | 2;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  accent?: 'default' | 'emerald' | 'danger';
  onBack?: () => void;
  headerAction?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

// Module-level stack so Escape closes only the topmost open layer and body scroll
// stays locked while any layer remains open.
const layerCloseStack: Array<() => void> = [];
let activeBodyLockCount = 0;
let escapeListenerAttached = false;

function handleGlobalKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && layerCloseStack.length > 0) {
    e.preventDefault();
    const topClose = layerCloseStack[layerCloseStack.length - 1];
    triggerHaptic('light');
    topClose();
  }
}

const SIZE_CLASSES: Record<NonNullable<LayerWindowProps['size']>, string> = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-3xl',
};

export const LayerWindow: React.FC<LayerWindowProps> = ({
  open,
  onClose,
  title,
  subtitle,
  layerLevel = 1,
  size = 'md',
  accent = 'default',
  onBack,
  headerAction,
  footer,
  children,
}) => {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    const closeHandler = () => onClose();
    layerCloseStack.push(closeHandler);

    if (!escapeListenerAttached) {
      window.addEventListener('keydown', handleGlobalKeyDown);
      escapeListenerAttached = true;
    }

    activeBodyLockCount += 1;
    if (activeBodyLockCount === 1) {
      document.body.style.overflow = 'hidden';
    }

    return () => {
      const idx = layerCloseStack.lastIndexOf(closeHandler);
      if (idx !== -1) layerCloseStack.splice(idx, 1);

      if (layerCloseStack.length === 0 && escapeListenerAttached) {
        window.removeEventListener('keydown', handleGlobalKeyDown);
        escapeListenerAttached = false;
      }

      activeBodyLockCount = Math.max(0, activeBodyLockCount - 1);
      if (activeBodyLockCount === 0) {
        document.body.style.overflow = '';
      }
    };
  }, [open, onClose]);

  if (!open) return null;

  const zIndexClass = layerLevel === 2 ? 'z-[60]' : 'z-50';
  const backdropClass =
    layerLevel === 2
      ? 'bg-slate-950/60 backdrop-blur-[2px]'
      : 'bg-slate-950/50 backdrop-blur-[2px]';

  const headerTone =
    accent === 'danger'
      ? 'bg-red-600 text-white border-red-700/40'
      : accent === 'emerald'
        ? 'bg-emerald-950 text-white border-emerald-900'
        : 'bg-white text-slate-900 border-slate-100';

  const subtitleTone =
    accent === 'danger'
      ? 'text-red-100'
      : accent === 'emerald'
        ? 'text-emerald-200'
        : 'text-slate-500';

  const iconBtnTone =
    accent === 'danger'
      ? 'text-white/90 hover:bg-white/15'
      : accent === 'emerald'
        ? 'text-emerald-100 hover:bg-white/10'
        : 'text-slate-500 hover:bg-slate-100';

  const handleTone =
    accent === 'danger'
      ? 'bg-white/35'
      : accent === 'emerald'
        ? 'bg-white/25'
        : 'bg-slate-200';

  const handleDismiss = () => {
    triggerHaptic('light');
    onClose();
  };

  return (
    <div
      className={`fixed inset-0 ${zIndexClass} flex items-end sm:items-center justify-center p-0 sm:p-4`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      {/* Interactive Backdrop */}
      <div
        aria-hidden="true"
        onClick={handleDismiss}
        className={`fixed inset-0 ${backdropClass} layer-backdrop-enter`}
      />

      {/* Layered Window / Mobile Bottom Sheet Surface */}
      <div
        className={`relative w-full ${SIZE_CLASSES[size]} max-h-[88dvh] sm:max-h-[86dvh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl overflow-hidden layer-sheet-enter ${
          layerLevel === 2 ? 'ring-1 ring-slate-900/10' : ''
        }`}
      >
        {/* Top Bar + Mobile Drag Affordance */}
        <div className={`shrink-0 border-b ${headerTone}`}>
          <div className="pt-2.5 sm:hidden flex justify-center">
            <span className={`w-10 h-1.5 rounded-full ${handleTone}`} />
          </div>
          <div className="px-4 sm:px-5 pt-2.5 sm:pt-4 pb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              {onBack && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onBack();
                  }}
                  aria-label="Back"
                  className={`min-h-[44px] min-w-[44px] -ml-1.5 flex items-center justify-center rounded-xl transition-colors shrink-0 ${iconBtnTone}`}
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              )}
              <div className="min-w-0">
                <h2 id={titleId} className="text-base font-bold leading-snug truncate">
                  {title}
                </h2>
                {subtitle && (
                  <p className={`text-xs truncate mt-0.5 ${subtitleTone}`}>{subtitle}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {headerAction}
              <button
                type="button"
                onClick={handleDismiss}
                aria-label={`Close ${title}`}
                className={`min-h-[44px] min-w-[44px] -mr-1.5 flex items-center justify-center rounded-xl transition-colors ${iconBtnTone}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable Window Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-5 py-4">
          {children}
        </div>

        {/* Optional Sticky Footer CTA Bar */}
        {footer && (
          <div className="shrink-0 border-t border-slate-200 bg-white px-4 sm:px-5 py-3.5 pb-safe">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
