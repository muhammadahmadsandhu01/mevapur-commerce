const {
  AssistantConfigurationError,
  createAssistantConfig
} = require('../../../modules/assistant/config/assistant.config');
const providerRegistry = require('../../../modules/assistant/providers/providerRegistry');
const AssistantService = require('../../../modules/assistant/assistant.service');

describe('P5C assistant configuration and provider boundary', () => {
  test('defaults to disabled without provider configuration', () => {
    const config = createAssistantConfig({});

    expect(config.enabled).toBe(false);
    expect(config.mode).toBe('disabled');
    expect(config.provider.configured).toBe(false);
    expect(config.historyPersist).toBe(false);
    expect(config.externalPiiAllowed).toBe(false);
  });

  test('accepts deterministic retrieval without a provider secret', () => {
    const config = createAssistantConfig({
      AI_ASSISTANT_ENABLED: 'true',
      AI_ASSISTANT_MODE: 'retrieval'
    });

    expect(config.mode).toBe('retrieval');
    expect(config.provider.apiKey).toBe('');
  });

  test('requires explicit provider configuration in provider mode', () => {
    expect(() => createAssistantConfig({
      AI_ASSISTANT_ENABLED: 'true',
      AI_ASSISTANT_MODE: 'provider',
      AI_PROVIDER: 'none'
    })).toThrow(AssistantConfigurationError);
  });

  test('rejects insecure or credential-bearing provider URLs', () => {
    const base = {
      AI_ASSISTANT_ENABLED: 'true',
      AI_ASSISTANT_MODE: 'provider',
      AI_PROVIDER: 'compatible',
      AI_PROVIDER_API_KEY: 'synthetic-test-value',
      AI_PROVIDER_MODEL: 'synthetic-model'
    };
    expect(() => createAssistantConfig({
      ...base,
      AI_PROVIDER_BASE_URL: 'http://provider.example.test'
    })).toThrow('AI_PROVIDER_BASE_URL: must use HTTPS');
    expect(() => createAssistantConfig({
      ...base,
      AI_PROVIDER_BASE_URL: 'https://user:pass@provider.example.test'
    })).toThrow('AI_PROVIDER_BASE_URL: must not contain credentials');
  });

  test('provider mode never runs without an explicitly registered active adapter', async () => {
    const config = createAssistantConfig({
      AI_ASSISTANT_ENABLED: 'true',
      AI_ASSISTANT_MODE: 'provider',
      AI_PROVIDER: 'compatible',
      AI_PROVIDER_BASE_URL: 'https://provider.example.test',
      AI_PROVIDER_API_KEY: 'synthetic-test-value',
      AI_PROVIDER_MODEL: 'synthetic-model'
    });
    const service = new AssistantService(config);

    expect(providerRegistry.list()).toEqual([]);
    await expect(service.chat({
      message: 'Explain shipping',
      audience: 'anonymous',
      requestId: 'test-provider-boundary'
    })).rejects.toMatchObject({
      code: 'ASSISTANT_PROVIDER_INACTIVE'
    });
  });

  test('persistent chat history is rejected', () => {
    expect(() => createAssistantConfig({
      AI_CHAT_HISTORY_PERSIST: 'true'
    })).toThrow('AI_CHAT_HISTORY_PERSIST');
  });
});
