import { knowledgeSnippet, knowledgeEmbedText, validateKnowledge } from './knowledge-format';

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
