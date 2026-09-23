import { useEffect, useState } from 'react';
import { Badge, Button, MonoLabel, Skeleton } from '@/ds';
import { supabase } from '@/lib/supabase';
import { errorCopy } from '@/lib/errors';
import { useOffice } from '@/lib/office';
import { navigate } from '@/lib/router';
import { AuthLayout, FormError } from '../auth/AuthLayout';

interface Preview {
  office_name: string;
  office_tone: string;
  members: number;
  valid: boolean;
}

export function JoinScreen({ token }: { token: string }) {
  const { office, reload } = useOffice();
  const [preview, setPreview] = useState<Preview | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.rpc('invite_preview', { p_token: token }).then(({ data }) => setPreview(((data as Preview[] | null) ?? [])[0] ?? null));
  }, [token]);

  const join = async () => {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc('join_office', { p_token: token, p_leave_current: office != null });
    setBusy(false);
    if (err) setError(errorCopy(err));
    else {
      await reload();
      navigate('/app/office');
    }
  };

  if (preview === undefined) {
    return (
      <AuthLayout title="Opening invite…">
        <div className="p-invite">
          <Skeleton width={48} height={48} radius="var(--radius-md)" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-8)', flex: 1 }}>
            <Skeleton width="60%" height={18} />
            <Skeleton width="40%" height={10} />
          </div>
        </div>
      </AuthLayout>
    );
  }
  if (!preview || !preview.valid) {
    return (
      <AuthLayout title={<>This invite is <em>closed</em>.</>} subtitle="Ask whoever sent it for a new link. Invite links last seven days.">
        <FormError>{errorCopy('invite_invalid')}</FormError>
        <Button variant="primary" size="lg" arrow href="#/app" block>Open Caden</Button>
      </AuthLayout>
    );
  }
  const already = office?.name === preview.office_name;
  return (
    <AuthLayout title={<>Join <em>{preview.office_name}</em>.</>} subtitle="Your agents come with you, and everyone's agents can start talking to each other.">
      <div className="p-invite">
        <span className="p-invite__tone" style={{ background: preview.office_tone }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)', minWidth: 0 }}>
          <span className="p-invite__name">{preview.office_name}</span>
          <MonoLabel size="tiny" tone="var(--text-muted)">{`${preview.members} ${preview.members === 1 ? 'person' : 'people'} and their agents`}</MonoLabel>
        </div>
      </div>
      {office && !already ? (
        <Badge variant="quiet" style={{ alignSelf: 'flex-start', whiteSpace: 'normal', lineHeight: 1.4 }}>{`You'll leave ${office.name}, and your agents move with you`}</Badge>
      ) : null}
      <FormError>{error}</FormError>
      {already ? (
        <Button variant="primary" size="lg" arrow href="#/app/office" block>You are already here</Button>
      ) : (
        <Button variant="primary" size="lg" arrow onClick={join} loading={busy} block>Join the office</Button>
      )}
      <Button variant="text" href="#/app" style={{ alignSelf: 'center' }}>Not now</Button>
    </AuthLayout>
  );
}
