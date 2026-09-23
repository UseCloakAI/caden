import { useEffect, useState } from 'react';
import { Button, NavBar } from '@/ds';
import { Hero } from './Hero';
import { Ticker } from './Ticker';
import { Features } from './Features';
import { HowItWorks } from './HowItWorks';
import { Showcase } from './Showcase';
import { Numbers } from './Numbers';
import { UseCases } from './UseCases';
import { Faq } from './Faq';
import { Footer } from './Footer';
import './marketing.css';

const NAV = [
  { label: 'Product', id: 'product' },
  { label: 'How it works', id: 'how' },
  { label: 'For families', id: 'families' },
  { label: 'Questions', id: 'faq' },
];

/** Which section is under the nav right now. */
function useActiveSection(ids: string[]) {
  const [active, setActive] = useState<string | undefined>();
  useEffect(() => {
    const els = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (hit) setActive(hit.target.id);
      },
      { rootMargin: '-35% 0% -55% 0%', threshold: [0, 0.25, 0.5] },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [ids]);
  return active;
}

const IDS = NAV.map((n) => n.id);

export function Home() {
  const active = useActiveSection(IDS);
  return (
    <div className="m-page">
      <NavBar
        items={NAV.map((n) => n.label)}
        active={NAV.find((n) => n.id === active)?.label}
        onSelect={(label) => document.getElementById(NAV.find((n) => n.label === label)!.id)?.scrollIntoView({ behavior: 'smooth' })}
        trailing={
          <>
            <Button variant="text" size="sm" href="#/signin" className="c-nav__hide-sm">Log in</Button>
            <Button variant="primary" size="sm" arrow href="#/signup">Get started</Button>
          </>
        }
        menuFooter={
          <>
            <Button variant="primary" size="lg" arrow block href="#/signup">Get started</Button>
            <Button variant="ghost" size="lg" block href="#/signin">Log in</Button>
          </>
        }
        style={{ position: 'fixed', left: 0, right: 0 }}
      />
      <main>
        <Hero />
        <Ticker />
        <Features />
        <HowItWorks />
        <Showcase />
        <Numbers />
        <UseCases />
        <Faq />
      </main>
      <Footer />
    </div>
  );
}
