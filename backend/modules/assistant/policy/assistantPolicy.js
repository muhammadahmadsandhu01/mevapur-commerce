const INVISIBLE_CHARS = /[\u00AD\u200B-\u200F\u2060\uFEFF]/g;
const BIDI_CONTROLS = /[\u202A-\u202E\u2066-\u2069]/g;

// Bounded confusable skeleton mapping for Cyrillic and Greek homoglyphs
// resembling Latin ASCII characters used in assistant policy keywords.
const CONFUSABLES_MAP = Object.freeze({
  // Cyrillic (strict visual lookalikes to Latin characters)
  '\u0430': 'a', // Cyrillic Small Letter A
  '\u0441': 'c', // Cyrillic Small Letter Es
  '\u0435': 'e', // Cyrillic Small Letter Ie
  '\u0451': 'e', // Cyrillic Small Letter Io
  '\u0456': 'i', // Cyrillic Small Letter Byelorussian-Ukrainian I
  '\u0458': 'j', // Cyrillic Small Letter Je
  '\u043A': 'k', // Cyrillic Small Letter Ka
  '\u043E': 'o', // Cyrillic Small Letter O
  '\u0440': 'p', // Cyrillic Small Letter Er
  '\u0455': 's', // Cyrillic Small Letter Dze
  '\u0443': 'y', // Cyrillic Small Letter U
  '\u0445': 'x', // Cyrillic Small Letter Ha

  // Greek (strict visual lookalikes to Latin characters)
  '\u03B1': 'a', // Greek Small Letter Alpha
  '\u03B5': 'e', // Greek Small Letter Epsilon
  '\u03B9': 'i', // Greek Small Letter Iota
  '\u03BA': 'k', // Greek Small Letter Kappa
  '\u03BF': 'o', // Greek Small Letter Omicron
  '\u03C1': 'p', // Greek Small Letter Rho
  '\u03C5': 'u', // Greek Small Letter Upsilon
  '\u03C7': 'x'  // Greek Small Letter Chi
});

// Static regex matching all confusable keys defined above
const CONFUSABLES_REGEX = /[\u0430\u0441\u0435\u0451\u0456\u0458\u043A\u043E\u0440\u0455\u0443\u0445\u03B1\u03B5\u03B9\u03BA\u03BF\u03C1\u03C5\u03C7]/gu;

const LATIN_CHAR = /\p{Script=Latin}/u;
const CYRILLIC_CHAR = /\p{Script=Cyrillic}/u;
const GREEK_CHAR = /\p{Script=Greek}/u;

const normalizeMixedScriptTokens = (text) => text.replace(/\p{L}+/gu, (token) => {
  let hasLatin = false;
  let hasCyrillic = false;
  let hasGreek = false;

  for (const char of token) {
    if (!hasLatin && LATIN_CHAR.test(char)) hasLatin = true;
    if (!hasCyrillic && CYRILLIC_CHAR.test(char)) hasCyrillic = true;
    if (!hasGreek && GREEK_CHAR.test(char)) hasGreek = true;
  }

  const scriptCount = (hasLatin ? 1 : 0) + (hasCyrillic ? 1 : 0) + (hasGreek ? 1 : 0);

  // Apply confusable replacement only when a letter token combines at least two script groups
  if (scriptCount >= 2) {
    return token.replace(
      CONFUSABLES_REGEX,
      (char) => CONFUSABLES_MAP[char] || char
    );
  }

  return token;
});

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

  return normalizeMixedScriptTokens(stripped);
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
