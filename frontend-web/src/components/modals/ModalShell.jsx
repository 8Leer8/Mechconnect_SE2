import { useEffect, useId } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const maxWidthClass = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
  "6xl": "max-w-6xl",
};

const headerVariantClass = {
  default: "from-card via-muted/40 to-card",
  danger: "from-red-950/35 via-card to-card",
  warning: "from-orange-950/30 via-card to-card",
};

/**
 * Shared overlay + card frame for admin modals (matches catalog / verification style).
 * @param {boolean} isOpen
 * @param {() => void} onClose — backdrop click, close button, Escape
 * @param {import('react').ReactNode} [children] — body (add your own padding)
 * @param {string} [title] — ignored if customHeader is set
 * @param {import('react').ReactNode} [description]
 * @param {import('react').ReactNode} [footer] — pinned bottom bar with border-t
 * @param {import('react').ReactNode} [leading] — small icon or badge before title
 * @param {import('react').ReactNode} [customHeader] — full header row (title/description ignored)
 * @param {'sm'|'md'|'lg'|'xl'|'2xl'|'3xl'|'4xl'|'6xl'|null|false} [maxWidth='md'] — use null/false and cardClassName for custom widths
 * @param {'default'|'danger'|'warning'} [variant='default']
 * @param {string} [overlayClassName] — e.g. z-[60] for stacked modals
 * @param {string} [cardClassName] — extra classes on the card (e.g. max-w when dynamic)
 * @param {string} [headerClassName] — extra padding on header strip
 */
export function ModalShell({
  isOpen,
  onClose,
  children,
  title,
  description,
  footer,
  leading,
  customHeader,
  maxWidth = "md",
  variant = "default",
  overlayClassName,
  cardClassName,
  headerClassName,
  showCloseButton = true,
}) {
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onClose?.();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const widthClass =
    maxWidth != null && maxWidth !== false && maxWidthClass[maxWidth]
      ? maxWidthClass[maxWidth]
      : "";

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4",
        overlayClassName
      )}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={cn(
          "relative w-full overflow-hidden rounded-xl border border-border bg-background shadow-2xl",
          widthClass,
          cardClassName
        )}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title && !customHeader ? titleId : undefined}
      >
        <div
          className={cn(
            "relative border-b border-border bg-gradient-to-r px-6 py-4 pr-14",
            headerVariantClass[variant] || headerVariantClass.default,
            headerClassName
          )}
        >
          {showCloseButton ? (
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          ) : null}

          {customHeader ? (
            customHeader
          ) : (
            <div className="flex items-start gap-3">
              {leading ? (
                <div className="mt-0.5 flex shrink-0 items-center">{leading}</div>
              ) : null}
              <div className="min-w-0 flex-1">
                {title ? (
                  <h2
                    id={titleId}
                    className="text-lg font-semibold text-foreground"
                  >
                    {title}
                  </h2>
                ) : null}
                {description ? (
                  <p className="mt-1 text-sm text-muted-foreground">{description}</p>
                ) : null}
              </div>
            </div>
          )}
        </div>

        {children}

        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-6 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
