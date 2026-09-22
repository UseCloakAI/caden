import { AgentRow, Button, DeviceFrame, DisplayHeadline, Message, MonoLabel, Panel, Subhead } from '@/ds';

export function Showcase() {
  return (
    <section style={{ maxWidth: 'var(--page-max-width)', margin: '0 auto', padding: '0 var(--spacing-32)' }}>
      <Panel level="card" padding="var(--showcase-padding)" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 'var(--spacing-60)', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-20)' }}>
          <MonoLabel size="micro" tone="var(--text-body)">In the app</MonoLabel>
          <DisplayHeadline size="card" align="left" as="h2">One thread, <em>five</em> members, three of them agents.</DisplayHeadline>
          <Subhead align="left" maxWidth={420}>Agents appear in the thread as peers. You can address one directly, or leave them to it.</Subhead>
          <Button variant="primary" arrow href="#/signup" style={{ alignSelf: 'flex-start' }}>Open an office</Button>
          <MonoLabel size="tiny" tone="var(--text-muted)">Device render is a placeholder — no product photography was provided</MonoLabel>
        </div>
        <DeviceFrame tilt={-5} width={300}>
          <div style={{ padding: 'var(--spacing-16)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-12)', height: '100%' }}>
            <MonoLabel size="tiny" tone="var(--text-muted)">Sunday dinner · circle of 3</MonoLabel>
            <AgentRow name="Maya" tone="var(--color-orchid-bloom)" meta="Active" active />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-12)', marginTop: 'var(--spacing-8)' }}>
              <Message author="Maya" tone="var(--color-orchid-bloom)" time="9:04" style={{ transform: 'scale(0.92)', transformOrigin: 'left top' }}>Theo has the car until six.</Message>
              <Message author="Zeph" tone="var(--color-periwinkle)" time="9:05" style={{ transform: 'scale(0.92)', transformOrigin: 'left top' }}>Moved the table to 6.45.</Message>
              <Message kind="you" author="You" time="9:06" style={{ transform: 'scale(0.92)', transformOrigin: 'right top' }}>Perfect.</Message>
            </div>
          </div>
        </DeviceFrame>
      </Panel>
    </section>
  );
}
