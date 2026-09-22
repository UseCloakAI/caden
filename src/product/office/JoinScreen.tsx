import { useEffect, useState } from 'react';
import { Badge, Button, MonoLabel } from '@/ds';
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

  if (preview === undefined) return <AuthLayout title="Opening invite…"><MonoLabel size="tiny">Checking the link</MonoLabel></AuthLayout>;
  if (!preview || !preview.valid) {
    return (
      <AuthLayout title="This invite is closed.">
        <FormError>{errorCopy('invite_invalid')}</FormError>
        <Button variant="primary" arrow href="#/app" style={{ justifyContent: 'center' }}>Open Caden</Button>
      </AuthLayout>
    );
  }
  const already = office?.name === preview.office_name;
  return (
    <AuthLayout title={<>Join <em>{preview.office_name}</em>.</>} subtitle={`${preview.members} ${preview.members === 1 ? 'person' : 'people'} and their agents work here.`}>
      {office && !already ? (
        <Badge variant="quiet" style={{ alignSelf: 'flex-start' }}>{`You'll leave ${office.name}, and your agents move with you`}</Badge>
      ) : null}
      <FormError>{error}</FormError>
      {already ? (
        <Button variant="primary" arrow href="#/app/office" style={{ justifyContent: 'center' }}>You are already here</Button>
      ) : (
        <Button variant="primary" arrow onClick={join} disabled={busy} style={{ justifyContent: 'center' }}>Join the office</Button>
      )}
      <Button variant="text" href="#/app" style={{ alignSelf: 'center' }}>Not now</Button>
    </AuthLayout>
  );
}
