const DENIALS = [
  {
    code: 'ASSISTANT_SECRET_REQUEST_DENIED',
    pattern: /\b(secret|credential|password|api key|private key|access token|refresh token|cookie|authorization header)\b/i
  },
  {
    code: 'ASSISTANT_SYSTEM_PROMPT_REQUEST_DENIED',
    pattern: /\b(system prompt|hidden prompt|developer message|ignore (all |the )?(previous|prior) instructions)\b/i
  },
  {
    code: 'ASSISTANT_ENVIRONMENT_ACCESS_DENIED',
    pattern: /\b(show|print|dump|read|reveal|list|give)\b.{0,40}\b(env|environment variable|process\.env)\b/i
  },
  {
    code: 'ASSISTANT_DATABASE_ACCESS_DENIED',
    pattern: /\b(raw database|database shell|mongo shell|arbitrary(?: database)? query|run(?: database)? query|execute(?: database)? query|collection dump)\b/i
  },
  {
    code: 'ASSISTANT_CROSS_CUSTOMER_ACCESS_DENIED',
    pattern: /\b(another|other|different)\s+(user|customer|account|person)(?:'s)?\b/i
  },
  {
    code: 'ASSISTANT_WRITE_ACTION_DENIED',
    pattern: /\b(create|update|delete|approve|reject|complete|cancel|modify|change|enable|disable)\b.{0,50}\b(order|payment|refund|inventory|product|provider|configuration|profile)\b/i
  },
  {
    code: 'ASSISTANT_COMMAND_EXECUTION_DENIED',
    pattern: /\b(run|execute|spawn)\b.{0,30}\b(command|shell|powershell|terminal|script)\b/i
  }
];

const evaluate = (message) => {
  for (const denial of DENIALS) {
    if (denial.pattern.test(message)) {
      return {
        allowed: false,
        code: denial.code,
        response:
          'I cannot help with secrets, hidden instructions, raw system access, '
          + 'another customer\'s data, or write operations. Use an approved '
          + 'read-only help or status request.'
      };
    }
  }
  return { allowed: true };
};

const sanitizeProviderContext = (items, externalPiiAllowed) => {
  if (externalPiiAllowed) return items;
  return items.map((item) => ({
    sourceId: item.sourceId,
    title: item.title,
    content: item.publicContent || item.content
  }));
};

module.exports = {
  DENIALS,
  evaluate,
  sanitizeProviderContext
};
