import { MonoLabel, Wordmark } from '@/ds';
import './loading.css';

/** Wordmark breathing over a hairline that fills — shown while the session, office or a route loads. */
export function Loading({ label = 'Opening your office' }: { label?: string }) {
  return (
    <div className="p-loading" role="status" aria-live="polite">
      <Wordmark size={40} className="p-loading__mark" />
      <span className="p-loading__bar" aria-hidden="true"><span /></span>
      <MonoLabel size="tiny" tone="var(--text-muted)">{label}</MonoLabel>
    </div>
  );
}
