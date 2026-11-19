import { knowledgeSnippet, knowledgeEmbedText, validateKnowledge, fitKnowledge, KNOWLEDGE_CHAR_BUDGET, KNOWLEDGE_MAX_ENTRIES } from './knowledge-format';

describe('knowledge-format', () => {
  it('shows the answer and its link together on the A: line', () => {
    expect(knowledgeSnippet({ type: 'faq', question: 'Where are you?', answer: 'Al Barsha 1', sourceUrl: 'https://maps.app.goo.gl/x', linkLabel: 'Google Maps location' }))
      .toBe('Q: Where are you?\nA: Al Barsha 1 — Google Maps location: https://maps.app.goo.gl/x');
  });

  it('allows a link-only answer', () => {
    expect(knowledgeSnippet({ type: 'faq', question: 'Can I see the menu?', sourceUrl: 'https://x.com/menu.pdf', linkLabel: 'Menu' }))
      .toBe('Q: Can I see the menu?\nA: Menu: https://x.com/menu.pdf');
    expect(validateKnowledge({ type: 'faq', question: 'Can I see the menu?', sourceUrl: 'https://x.com/menu.pdf' })).toBeNull();
  });

  it('older link-only entries now reach the bot (they used to render empty)', () => {
    expect(knowledgeSnippet({ type: 'url', sourceUrl: 'https://x.com/about' })).toBe('Link: https://x.com/about');
  });

  it('general information keeps its text', () => {
    expect(knowledgeSnippet({ type: 'text', content: 'We are family owned since 1998.' })).toBe('We are family owned since 1998.');
  });

  it('rejects incomplete or unsafe entries', () => {
    expect(validateKnowledge({ type: 'faq', question: '', answer: 'x' })).toMatch(/question/);
    expect(validateKnowledge({ type: 'faq', question: 'Where?' })).toMatch(/answer, a link/);
    expect(validateKnowledge({ type: 'faq', question: 'Where?', sourceUrl: 'javascript:alert(1)' })).toMatch(/http/);
    expect(validateKnowledge({ type: 'text', content: ' ' })).toMatch(/information/);
  });

  it('embeds the question, answer and link label', () => {
    expect(knowledgeEmbedText({ type: 'faq', question: 'Where?', answer: 'Barsha', linkLabel: 'Google Maps location' })).toBe('Where? Barsha Google Maps location');
  });
});

const listing = (i: number, size = 200) => ({
  type: 'faq',
  question: `Tell me about unit ${i}`,
  answer: `Unit ${i}: 2 bedrooms, ${'x'.repeat(size)}`,
  sourceUrl: `https://agency.example/listings/${i}`,
  linkLabel: 'Listing',
});

describe('fitKnowledge', () => {
  it('sends a small knowledge base in full (more than the old top 4)', () => {
    const out = fitKnowledge(Array.from({ length: 12 }, (_, i) => listing(i)));
    expect(out).toHaveLength(12);
    expect(out[11]).toContain('https://agency.example/listings/11');
  });

  it('keeps ranked order and stops at the character budget', () => {
    const out = fitKnowledge(Array.from({ length: 200 }, (_, i) => listing(i, 900)));
    expect(out[0]).toContain('unit 0');
    expect(out.join('').length).toBeLessThanOrEqual(KNOWLEDGE_CHAR_BUDGET);
    expect(out.length).toBeGreaterThan(4);
  });

  it('never sends more than the entry cap', () => {
    expect(fitKnowledge(Array.from({ length: 100 }, (_, i) => listing(i, 10)))).toHaveLength(KNOWLEDGE_MAX_ENTRIES);
  });

  it('always keeps the best match, even when it alone is over the budget', () => {
    const out = fitKnowledge([listing(0, KNOWLEDGE_CHAR_BUDGET + 500), listing(1)]);
    expect(out).toHaveLength(1);
  });
});
