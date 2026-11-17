import { embeddingProviderFor, listChatModels } from './ai-provider.util';
import { ApiKeyProvider } from './schemas/api-key.schema';

const reply = (body: any) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

describe('ai-provider.util', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  it('one provider: OpenAI/Gemini embed with themselves, Claude has no embeddings', () => {
    expect(embeddingProviderFor(ApiKeyProvider.OPENAI)).toBe(ApiKeyProvider.OPENAI);
    expect(embeddingProviderFor(ApiKeyProvider.GEMINI)).toBe(ApiKeyProvider.GEMINI);
    expect(embeddingProviderFor(ApiKeyProvider.ANTHROPIC)).toBeNull();
  });

  it('OpenAI list keeps only chat models, with the owner key', async () => {
    const fetchMock = jest.fn(() => reply({ data: ['gpt-4o-mini', 'o3-mini', 'text-embedding-3-small', 'whisper-1', 'dall-e-3', 'gpt-4o-realtime-preview', 'tts-1', 'gpt-4o'].map((id) => ({ id })) }));
    global.fetch = fetchMock as any;
    const models = await listChatModels(ApiKeyProvider.OPENAI, 'sk-owner');
    expect(models.map((m) => m.id)).toEqual(['gpt-4o', 'gpt-4o-mini', 'o3-mini']);
    expect((fetchMock.mock.calls[0] as any)[1].headers.Authorization).toBe('Bearer sk-owner');
  });

  it('Gemini list keeps generateContent models and strips the models/ prefix', async () => {
    global.fetch = jest.fn(() => reply({ models: [
      { name: 'models/gemini-2.0-flash', displayName: 'Gemini 2.0 Flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
    ] })) as any;
    expect(await listChatModels(ApiKeyProvider.GEMINI, 'g-key')).toEqual([{ id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' }]);
  });

  it('Anthropic list uses display names', async () => {
    global.fetch = jest.fn(() => reply({ data: [{ id: 'claude-sonnet-4-5', display_name: 'Claude Sonnet 4.5' }] })) as any;
    expect(await listChatModels(ApiKeyProvider.ANTHROPIC, 'a-key')).toEqual([{ id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' }]);
  });

  it('a rejected key surfaces as an error', async () => {
    global.fetch = jest.fn(() => Promise.resolve(new Response('no', { status: 401 }))) as any;
    await expect(listChatModels(ApiKeyProvider.OPENAI, 'bad')).rejects.toThrow(/401/);
  });
});
