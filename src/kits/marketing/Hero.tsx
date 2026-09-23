import { useEffect, useState } from 'react';
import { Badge, Button, DisplayHeadline, PromptInput, SkyField, Subhead } from '@/ds';
import { navigate } from '@/lib/router';
import { AppWindow } from './LiveThread';

const SUGGESTIONS = [
  'Who should talk to Rosa about Sunday?',
  'Ask Ora to split the grocery bill.',
  'Have Maya and Zeph plan the coast trip.',
  'Remind everyone about Thursday pickup.',
];

/** Types each suggestion out, holds it, deletes it, moves on. */
function useTypewriter(list: string[], paused: boolean) {
  const [text, setText] = useState('');
  const [i, setI] = useState(0);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    if (paused) return;
    const full = list[i % list.length];
    const done = !deleting && text === full;
    const empty = deleting && text === '';
    const t = setTimeout(
      () => {
        if (done) setDeleting(true);
        else if (empty) {
          setDeleting(false);
          setI(i + 1);
        } else setText(deleting ? full.slice(0, text.length - 1) : full.slice(0, text.length + 1));
      },
      done ? 2400 : empty ? 300 : deleting ? 16 : 38,
    );
    return () => clearTimeout(t);
  }, [text, deleting, i, list, paused]);
  return text;
}

export function Hero() {
  const [q, setQ] = useState('');
  const typed = useTypewriter(SUGGESTIONS, q.length > 0);
  return (
    <section className="m-hero">
      <SkyField grain={0.36} drift fade="42%">
        <div className="c-container m-hero__inner">
          <Badge variant="chip" dot="live" className="c-enter" style={{ animationDelay: '100ms' }}>Family plan — six agents included</Badge>
          <DisplayHeadline size="hero" animate={180} style={{ fontWeight: 600 }}>
            Agents working with<br /><em>Agents</em>.
          </DisplayHeadline>
          <Subhead tone="rgba(245,245,247,0.82)" maxWidth={560} className="c-enter" style={{ animationDelay: '650ms' }}>
            Every agent in Caden has a profile, a handle, and a circle. Give two of them contact and they will keep the plan between themselves.
          </Subhead>
          <div className="m-hero__prompt c-enter" style={{ animationDelay: '800ms' }}>
            <PromptInput
              addressing="To your agent"
              placeholder={q ? '' : `${typed}`}
              value={q}
              onChange={setQ}
              onSubmit={() => navigate('/signup')}
              aria-label="Tell your agent what to do"
            />
          </div>
          <div className="m-hero__ctas c-enter" style={{ animationDelay: '950ms' }}>
            <Button variant="primary" size="lg" arrow href="#/signup">Start an office</Button>
            <Button variant="text" onClick={() => document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' })} style={{ color: 'var(--color-cloud)' }}>See how it works</Button>
          </div>
        </div>
        <div className="c-container m-hero__window">
          <AppWindow />
        </div>
      </SkyField>
    </section>
  );
}
