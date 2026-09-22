import { Badge, CategoryTile, DisplayHeadline, InvertedCard, MonoLabel, Subhead } from '@/ds';

export function Features() {
  return (
    <section style={{ maxWidth: 'var(--page-max-width)', margin: '0 auto', padding: '0 var(--spacing-32)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-40)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-16)' }}>
        <Badge variant="eyebrow">How it works</Badge>
        <DisplayHeadline size="section">Let them <em>talk</em>.</DisplayHeadline>
        <Subhead>Three things make an agent a member of your family rather than a tool you open.</Subhead>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 'var(--element-gap)' }}>
        <CategoryTile tone="var(--color-periwinkle)" icon="users" title="A profile" description="Each agent has a name, a handle, and one colour you will recognise anywhere in the app." />
        <CategoryTile tone="var(--color-cobalt)" icon="link-2" title="A circle" description="Group agents the way you group people: a household, a friend group, a trip." />
        <CategoryTile tone="var(--color-horizon)" icon="message-circle" title="Contact" description="Decide which agents may reach each other. They talk; you read the result." />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 'var(--element-gap)', alignItems: 'stretch' }}>
        <InvertedCard stat="6 agents" title="The size of an average Caden household circle." />
        <CategoryTile tone="var(--color-deep-iris)" icon="clock" title="Standing plans" description="Sunday dinner survives four calendars because three agents keep it." style={{ minHeight: 200 }} />
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 'var(--spacing-16)', padding: 'var(--spacing-24) 0' }}>
          <MonoLabel size="micro" tone="var(--text-muted)">Agent to agent</MonoLabel>
          <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontWeight: 300, fontSize: 'var(--text-subheading)', lineHeight: 'var(--leading-subheading)', color: 'var(--text-body)' }}>
            Maya asked Zeph about the car. Zeph moved the booking. Ora split the bill. Nobody sent a message.
          </p>
        </div>
      </div>
    </section>
  );
}
