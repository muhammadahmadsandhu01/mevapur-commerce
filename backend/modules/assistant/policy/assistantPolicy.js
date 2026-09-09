const INVISIBLE_CHARS = /[\u00AD\u200B-\u200F\u2060\uFEFF]/g;
const BIDI_CONTROLS = /[\u202A-\u202E\u2066-\u2069]/g;

// Bounded confusable skeleton mapping for Cyrillic and Greek homoglyphs
// resembling Latin ASCII characters used in assistant policy keywords.
const CONFUSABLES_MAP = Object.freeze({
  // Cyrillic
  '\u0430': 'a', '\u0410': 'a',
  '\u0441': 'c', '\u0421': 'c',
  '\u0434': 'd', '\u0414': 'd', '\u0501': 'd', '\u0500': 'd',
  '\u0435': 'e', '\u0415': 'e', '\u0451': 'e', '\u0401': 'e',
  '\u0456': 'i', '\u0406': 'i',
  '\u0458': 'j', '\u0408': 'j',
  '\u043A': 'k', '\u041A': 'k',
  '\u043E': 'o', '\u041E': 'o',
  '\u0440': 'p', '\u0420': 'p',
  '\u0455': 's', '\u0405': 's',
  '\u0442': 't', '\u0422': 't',
  '\u0443': 'y', '\u0423': 'y',
  '\u0445': 'x', '\u0425': 'x',

  // Greek
  '\u03B1': 'a', '\u0391': 'a',
  '\u03B2': 'b', '\u0392': 'b',
  '\u03B5': 'e', '\u0395': 'e',
  '\u03B7': 'h', '\u0397': 'h',
  '\u03B9': 'i', '\u0399': 'i',
  '\u03BA': 'k', '\u039A': 'k',
  '\u03BD': 'v', '\u039D': 'v',
  '\u03BF': 'o', '\u039F': 'o',
  '\u03C1': 'p', '\u03A1': 'p',
  '\u03C4': 't', '\u03A4': 't',
  '\u03C5': 'u', '\u03A5': 'u',
  '\u03C7': 'x', '\u03A7': 'x'
});

const CONFUSABLES_REGEX = new RegExp(
  `[${Object.keys(CONFUSABLES_MAP).join('')}]`,
  'g'
);

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

const normalizeForInspection = (message) => {
  if (typeof message !== 'string') return '';

  const nfkc = message.normalize('NFKC');
  const stripped = nfkc
    .replace(INVISIBLE_CHARS, '')
    .replace(BIDI_CONTROLS, '')
    .toLowerCase();

  return stripped.replace(
    CONFUSABLES_REGEX,
    (char) => CONFUSABLES_MAP[char] || char
  );
};

const evaluate = (message) => {
  const normalized = normalizeForInspection(message);

  for (const denial of DENIALS) {
    if (denial.pattern.test(normalized)) {
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
  normalizeForInspection,
  evaluate,
  sanitizeProviderContext
};
