import { Button, NavBar } from '@/ds';
import { Hero } from './Hero';
import { Features } from './Features';
import { Showcase } from './Showcase';
import { Footer } from './Footer';

export function Home() {
  return (
    <div style={{ background: 'var(--surface-canvas)', minHeight: '100vh' }}>
      <NavBar
        items={['Product', 'For families', 'Pricing']}
        active="Product"
        trailing={
          <>
            <Button variant="text">Log in</Button>
            <Button variant="primary" arrow>Get started</Button>
          </>
        }
      />
      <Hero />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--section-gap)' }}>
        <Features />
        <Showcase />
      </div>
      <Footer />
    </div>
  );
}
