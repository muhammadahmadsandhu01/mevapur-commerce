const MODES = new Set(['disabled', 'retrieval', 'provider']);
const BOOLEAN_VALUES = new Set(['true', 'false']);

class AssistantConfigurationError extends Error {
  constructor(variableName, reason) {
    super(`${variableName}: ${reason}`);
    this.name = 'AssistantConfigurationError';
    this.code = 'ASSISTANT_CONFIGURATION_INVALID';
    this.variableName = variableName;
  }
}

const optional = (environment, name) => {
  const value = environment[name];
  return typeof value === 'string' ? value.trim() : '';
};

const booleanValue = (environment, name, fallback) => {
  const value = optional(environment, name);
  if (!value) return fallback;
  if (!BOOLEAN_VALUES.has(value)) {
    throw new AssistantConfigurationError(name, 'must be true or false');
  }
  return value === 'true';
};

const integerValue = (environment, name, fallback, minimum, maximum) => {
  const value = optional(environment, name);
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new AssistantConfigurationError(
      name,
      `must be an integer from ${minimum} to ${maximum}`
    );
  }
  return parsed;
};

const validateProviderBaseUrl = (value) => {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new AssistantConfigurationError(
      'AI_PROVIDER_BASE_URL',
      'must be a valid HTTPS URL'
    );
  }
  if (parsed.protocol !== 'https:') {
    throw new AssistantConfigurationError(
      'AI_PROVIDER_BASE_URL',
      'must use HTTPS'
    );
  }
  if (parsed.username || parsed.password) {
    throw new AssistantConfigurationError(
      'AI_PROVIDER_BASE_URL',
      'must not contain credentials'
    );
  }
  return parsed.toString().replace(/\/$/, '');
};

const createAssistantConfig = (environment = process.env) => {
  const enabled = booleanValue(
    environment,
    'AI_ASSISTANT_ENABLED',
    false
  );
  const mode = (optional(environment, 'AI_ASSISTANT_MODE') || 'disabled')
    .toLowerCase();

  if (!MODES.has(mode)) {
    throw new AssistantConfigurationError(
      'AI_ASSISTANT_MODE',
      'must be disabled, retrieval, or provider'
    );
  }
  if (!enabled && mode !== 'disabled') {
    throw new AssistantConfigurationError(
      'AI_ASSISTANT_ENABLED',
      'must be true when AI_ASSISTANT_MODE is retrieval or provider'
    );
  }
  if (enabled && mode === 'disabled') {
    throw new AssistantConfigurationError(
      'AI_ASSISTANT_MODE',
      'must be retrieval or provider when the assistant is enabled'
    );
  }

  const historyPersist = booleanValue(
    environment,
    'AI_CHAT_HISTORY_PERSIST',
    false
  );
  if (historyPersist) {
    throw new AssistantConfigurationError(
      'AI_CHAT_HISTORY_PERSIST',
      'persistent history is not supported by the P5C foundation'
    );
  }

  const providerName = (
    optional(environment, 'AI_PROVIDER') || 'none'
  ).toLowerCase();
  let provider = Object.freeze({
    name: providerName,
    baseUrl: '',
    apiKey: '',
    model: '',
    configured: false,
    active: false
  });

  if (mode === 'provider') {
    if (!providerName || providerName === 'none') {
      throw new AssistantConfigurationError(
        'AI_PROVIDER',
        'an explicit provider adapter name is required in provider mode'
      );
    }
    const baseUrl = optional(environment, 'AI_PROVIDER_BASE_URL');
    const apiKey = optional(environment, 'AI_PROVIDER_API_KEY');
    const model = optional(environment, 'AI_PROVIDER_MODEL');
    if (!baseUrl) {
      throw new AssistantConfigurationError(
        'AI_PROVIDER_BASE_URL',
        'is required in provider mode'
      );
    }
    if (!apiKey) {
      throw new AssistantConfigurationError(
        'AI_PROVIDER_API_KEY',
        'is required in provider mode'
      );
    }
    if (!model) {
      throw new AssistantConfigurationError(
        'AI_PROVIDER_MODEL',
        'is required in provider mode'
      );
    }
    provider = Object.freeze({
      name: providerName,
      baseUrl: validateProviderBaseUrl(baseUrl),
      apiKey,
      model,
      configured: true,
      // No external adapter is activated during P5C.
      active: false
    });
  }

  return Object.freeze({
    enabled,
    mode,
    timeoutMs: integerValue(
      environment,
      'AI_REQUEST_TIMEOUT_MS',
      5000,
      250,
      15000
    ),
    maxInputChars: integerValue(
      environment,
      'AI_MAX_INPUT_CHARS',
      2000,
      100,
      4000
    ),
    maxContextItems: integerValue(
      environment,
      'AI_MAX_CONTEXT_ITEMS',
      5,
      1,
      10
    ),
    maxHistoryItems: 8,
    historyPersist,
    externalPiiAllowed: booleanValue(
      environment,
      'AI_EXTERNAL_PII_ALLOWED',
      false
    ),
    provider
  });
};

module.exports = {
  AssistantConfigurationError,
  createAssistantConfig
};
