const fs = require('fs');
const path = require('path');

const sourcePath = path.resolve(
  __dirname,
  '../modules/assistant/knowledge/records.json'
);
const outputPath = path.resolve(
  __dirname,
  '../modules/assistant/knowledge/index.json'
);
const forbiddenContent = /(?:mongodb(?:\+srv)?:\/\/|authorization:|bearer\s+|api[_-]?key\s*[=:]|password\s*[=:]|P5C_PRE_CHANGE_WORKING_TREE)/i;

const records = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
if (!Array.isArray(records) || records.length === 0) {
  throw new Error('ASSISTANT_INDEX_SOURCE_EMPTY');
}

const ids = new Set();
for (const record of records) {
  const required = [
    'id',
    'title',
    'audience',
    'category',
    'content',
    'sourceReference'
  ];
  if (required.some((key) => !record[key])) {
    throw new Error('ASSISTANT_INDEX_RECORD_INVALID');
  }
  if (ids.has(record.id)) {
    throw new Error('ASSISTANT_INDEX_DUPLICATE_ID');
  }
  ids.add(record.id);
  if (forbiddenContent.test(JSON.stringify(record))) {
    throw new Error('ASSISTANT_INDEX_FORBIDDEN_CONTENT');
  }
}

const normalized = records
  .map((record) => ({
    id: String(record.id),
    title: String(record.title),
    audience: [...record.audience].map(String).sort(),
    category: String(record.category),
    content: String(record.content),
    sourceReference: String(record.sourceReference)
  }))
  .sort((left, right) => left.id.localeCompare(right.id));

fs.writeFileSync(outputPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
process.stdout.write(`ASSISTANT_KNOWLEDGE_INDEX_PASS records=${normalized.length}\n`);
