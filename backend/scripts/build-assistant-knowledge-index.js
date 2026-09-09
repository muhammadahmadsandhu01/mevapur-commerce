const fs = require('fs');
const path = require('path');
const {
  CANONICAL_AUDIENCES,
  REQUIRED_FIELDS,
  REQUIRED_STRING_FIELDS,
  FORBIDDEN_CONTENT_REGEX,
  validateKnowledgeRecords,
  buildKnowledgeIndex,
  serializeKnowledgeIndex
} = require('../modules/assistant/knowledge/knowledgeIndexContract');

const DEFAULT_SOURCE_PATH = path.resolve(
  __dirname,
  '../modules/assistant/knowledge/records.json'
);
const DEFAULT_OUTPUT_PATH = path.resolve(
  __dirname,
  '../modules/assistant/knowledge/index.json'
);

/**
 * Checks if the committed index on disk matches the canonical generated output.
 * Non-mutating: makes zero file writes.
 *
 * @param {object} [options]
 * @param {string} [options.sourcePath]
 * @param {string} [options.targetPath]
 * @returns {{ valid: boolean, recordCount: number, canonicalIndex: Array<object> }}
 */
function checkKnowledgeIndex(options = {}) {
  const sourcePath = options.sourcePath || DEFAULT_SOURCE_PATH;
  const targetPath = options.targetPath || DEFAULT_OUTPUT_PATH;

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`ASSISTANT_INDEX_SOURCE_NOT_FOUND: Source file does not exist at "${sourcePath}"`);
  }
  if (!fs.existsSync(targetPath)) {
    throw new Error(`ASSISTANT_INDEX_TARGET_NOT_FOUND: Target file does not exist at "${targetPath}"`);
  }

  const rawSource = fs.readFileSync(sourcePath, 'utf8');
  let records;
  try {
    records = JSON.parse(rawSource);
  } catch (parseError) {
    throw new Error(`ASSISTANT_INDEX_SOURCE_JSON_INVALID: ${parseError.message}`);
  }

  const canonicalIndex = buildKnowledgeIndex(records);
  const expectedSerialized = serializeKnowledgeIndex(canonicalIndex);
  const committedRaw = fs.readFileSync(targetPath, 'utf8');

  if (expectedSerialized !== committedRaw) {
    throw new Error('ASSISTANT_INDEX_DRIFT_DETECTED: Committed index.json does not match canonical generated index');
  }

  return {
    valid: true,
    recordCount: canonicalIndex.length,
    canonicalIndex
  };
}

/**
 * Writes the canonical generated index to the target output path.
 *
 * @param {object} [options]
 * @param {string} [options.sourcePath]
 * @param {string} [options.targetPath]
 * @returns {{ written: boolean, recordCount: number, targetPath: string }}
 */
function writeKnowledgeIndex(options = {}) {
  const sourcePath = options.sourcePath || DEFAULT_SOURCE_PATH;
  const targetPath = options.targetPath || DEFAULT_OUTPUT_PATH;

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`ASSISTANT_INDEX_SOURCE_NOT_FOUND: Source file does not exist at "${sourcePath}"`);
  }

  const rawSource = fs.readFileSync(sourcePath, 'utf8');
  let records;
  try {
    records = JSON.parse(rawSource);
  } catch (parseError) {
    throw new Error(`ASSISTANT_INDEX_SOURCE_JSON_INVALID: ${parseError.message}`);
  }

  const canonicalIndex = buildKnowledgeIndex(records);
  const serialized = serializeKnowledgeIndex(canonicalIndex);

  fs.writeFileSync(targetPath, serialized, 'utf8');

  return {
    written: true,
    recordCount: canonicalIndex.length,
    targetPath
  };
}

/**
 * CLI execution handler.
 *
 * @param {Array<string>} [argv]
 * @returns {number} Exit code (0 for success, non-zero for failure)
 */
function runCli(argv = process.argv.slice(2)) {
  const mode = argv[0];

  if (mode === '--check') {
    try {
      const result = checkKnowledgeIndex();
      process.stdout.write(`ASSISTANT_KNOWLEDGE_INDEX_PASS records=${result.recordCount}\n`);
      return 0;
    } catch (error) {
      process.stderr.write(`ASSISTANT_KNOWLEDGE_INDEX_FAIL: ${error.message}\n`);
      return 1;
    }
  }

  if (mode === '--write') {
    try {
      const result = writeKnowledgeIndex();
      process.stdout.write(`ASSISTANT_KNOWLEDGE_INDEX_PASS records=${result.recordCount}\n`);
      return 0;
    } catch (error) {
      process.stderr.write(`ASSISTANT_KNOWLEDGE_INDEX_FAIL: ${error.message}\n`);
      return 1;
    }
  }

  const helpText = [
    'Usage: node scripts/build-assistant-knowledge-index.js <mode>',
    '',
    'Modes:',
    '  --check   Validate records.json and verify index.json has no drift (read-only)',
    '  --write   Validate records.json and regenerate index.json',
    ''
  ].join('\n');

  if (!mode) {
    process.stderr.write(`ASSISTANT_KNOWLEDGE_INDEX_ERROR: Missing required mode (--check | --write)\n${helpText}`);
    return 1;
  }

  process.stderr.write(`ASSISTANT_KNOWLEDGE_INDEX_ERROR: Unknown mode "${mode}"\n${helpText}`);
  return 1;
}

if (require.main === module) {
  const exitCode = runCli();
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

module.exports = {
  CANONICAL_AUDIENCES,
  REQUIRED_FIELDS,
  REQUIRED_STRING_FIELDS,
  FORBIDDEN_CONTENT_REGEX,
  validateKnowledgeRecords,
  buildKnowledgeIndex,
  serializeKnowledgeIndex,
  checkKnowledgeIndex,
  writeKnowledgeIndex,
  runCli,
  DEFAULT_SOURCE_PATH,
  DEFAULT_OUTPUT_PATH
};

