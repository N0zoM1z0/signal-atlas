import {
  cloneElement,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
}

export function Button({ className, type = 'button', variant = 'primary', ...props }: ButtonProps) {
  return (
    <button
      className={classes('sa-button', `sa-button--${variant}`, className)}
      type={type}
      {...props}
    />
  );
}

export interface IconButtonProps extends Omit<ButtonProps, 'aria-label'> {
  accessibleLabel: string;
  children: ReactNode;
}

export function IconButton({ accessibleLabel, children, className, ...props }: IconButtonProps) {
  return (
    <Button
      aria-label={accessibleLabel}
      className={classes('sa-icon-button', className)}
      variant="quiet"
      {...props}
    >
      {children}
    </Button>
  );
}

export interface PanelProps extends HTMLAttributes<HTMLElement> {
  title?: string;
  eyebrow?: string;
  actions?: ReactNode;
}

export function Panel({ actions, children, className, eyebrow, title, ...props }: PanelProps) {
  const titleId = useId();

  return (
    <section
      aria-labelledby={title ? titleId : undefined}
      className={classes('sa-panel', className)}
      {...props}
    >
      {(title || eyebrow || actions) && (
        <header className="sa-panel__header">
          <div>
            {eyebrow && <p className="sa-eyebrow">{eyebrow}</p>}
            {title && <h2 id={titleId}>{title}</h2>}
          </div>
          {actions && <div className="sa-panel__actions">{actions}</div>}
        </header>
      )}
      <div className="sa-panel__body">{children}</div>
    </section>
  );
}

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: 'neutral' | 'yes' | 'no' | 'context' | 'disputed' | 'success';
}

export function Badge({ children, className, tone = 'neutral', ...props }: BadgeProps) {
  return (
    <span className={classes('sa-badge', `sa-badge--${tone}`, className)} {...props}>
      {children}
    </span>
  );
}

export interface TooltipProps {
  children: ReactElement<{ 'aria-describedby'?: string }>;
  content: ReactNode;
}

export function Tooltip({ children, content }: TooltipProps) {
  const tooltipId = useId();
  const describedBy = [children.props['aria-describedby'], tooltipId].filter(Boolean).join(' ');

  return (
    <span className="sa-tooltip">
      {cloneElement(children, { 'aria-describedby': describedBy })}
      <span className="sa-tooltip__content" id={tooltipId} role="tooltip">
        {content}
      </span>
    </span>
  );
}

export interface DialogProps {
  children: ReactNode;
  description?: string;
  open: boolean;
  title: string;
  onClose: () => void;
}

export function Dialog({ children, description, onClose, open, title }: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;

    const returnFocusTarget =
      document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const dialog = dialogRef.current;
    const focusableSelector = [
      'button:not([disabled])',
      'a[href]',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');
    const focusableElements = () =>
      dialog
        ? [...dialog.querySelectorAll<HTMLElement>(focusableSelector)].filter(
            (element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true',
          )
        : [];
    (focusableElements()[0] ?? dialog)?.focus();

    const handleDialogKeys = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const elements = focusableElements();
      if (elements.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = elements[0];
      const last = elements.at(-1);
      if (!first || !last) return;
      if (
        event.shiftKey &&
        (document.activeElement === first || !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleDialogKeys);
    return () => {
      document.removeEventListener('keydown', handleDialogKeys);
      if (returnFocusTarget?.isConnected) returnFocusTarget.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="sa-dialog-layer">
      <button
        aria-label="Close dialog"
        className="sa-dialog__backdrop"
        onClick={onClose}
        type="button"
      />
      <section
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className="sa-dialog"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="sa-dialog__header">
          <div>
            <p className="sa-eyebrow">Signal Atlas</p>
            <h2 id={titleId}>{title}</h2>
          </div>
          <IconButton accessibleLabel="Close" onClick={onClose}>
            ×
          </IconButton>
        </header>
        {description && (
          <p className="sa-dialog__description" id={descriptionId}>
            {description}
          </p>
        )}
        <div className="sa-dialog__body">{children}</div>
      </section>
    </div>
  );
}

export interface TabDefinition {
  id: string;
  label: string;
  panel: ReactNode;
}

export interface TabsProps {
  ariaLabel: string;
  defaultTabId?: string;
  tabs: readonly TabDefinition[];
}

export function Tabs({ ariaLabel, defaultTabId, tabs }: TabsProps) {
  const fallbackId = tabs[0]?.id ?? '';
  const [selectedId, setSelectedId] = useState(defaultTabId ?? fallbackId);
  const tabIds = useMemo(() => tabs.map((tab) => tab.id), [tabs]);

  if (tabs.length === 0) return null;

  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, direction: -1 | 1) => {
    const index = tabIds.indexOf(selectedId);
    const nextIndex = (index + direction + tabIds.length) % tabIds.length;
    const nextId = tabIds[nextIndex];
    if (!nextId) return;
    setSelectedId(nextId);
    const nextButton = event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(
      `[data-tab-id="${nextId}"]`,
    );
    nextButton?.focus();
  };

  return (
    <div className="sa-tabs">
      <div aria-label={ariaLabel} className="sa-tab-list" role="tablist">
        {tabs.map((tab) => {
          const selected = tab.id === selectedId;
          return (
            <button
              aria-controls={`panel-${tab.id}`}
              aria-selected={selected}
              className="sa-tab"
              data-tab-id={tab.id}
              id={`tab-${tab.id}`}
              key={tab.id}
              onClick={() => setSelectedId(tab.id)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowLeft') {
                  event.preventDefault();
                  moveFocus(event, -1);
                }
                if (event.key === 'ArrowRight') {
                  event.preventDefault();
                  moveFocus(event, 1);
                }
                if (event.key === 'Home') {
                  event.preventDefault();
                  setSelectedId(tabIds[0] ?? selectedId);
                }
                if (event.key === 'End') {
                  event.preventDefault();
                  setSelectedId(tabIds.at(-1) ?? selectedId);
                }
              }}
              role="tab"
              tabIndex={selected ? 0 : -1}
              type="button"
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => (
        <div
          aria-labelledby={`tab-${tab.id}`}
          className="sa-tab-panel"
          hidden={tab.id !== selectedId}
          id={`panel-${tab.id}`}
          key={tab.id}
          role="tabpanel"
          tabIndex={0}
        >
          {tab.panel}
        </div>
      ))}
    </div>
  );
}

export interface ProgressProps {
  label: string;
  max?: number;
  value: number;
}

export function Progress({ label, max = 100, value }: ProgressProps) {
  const safeMax = Math.max(max, 1);
  const boundedValue = Math.min(Math.max(value, 0), safeMax);
  return (
    <div className="sa-progress">
      <div className="sa-progress__label">
        <span>{label}</span>
        <span>{Math.round((boundedValue / safeMax) * 100)}%</span>
      </div>
      <progress aria-label={label} max={safeMax} value={boundedValue} />
    </div>
  );
}

export interface CardProps extends HTMLAttributes<HTMLElement> {
  eyebrow?: string;
  title: string;
}

export function Card({ children, className, eyebrow, title, ...props }: CardProps) {
  const titleId = useId();
  return (
    <article aria-labelledby={titleId} className={classes('sa-card', className)} {...props}>
      {eyebrow && <p className="sa-eyebrow">{eyebrow}</p>}
      <h3 id={titleId}>{title}</h3>
      <div className="sa-card__body">{children}</div>
    </article>
  );
}
