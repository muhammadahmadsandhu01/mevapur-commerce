const fs = require('fs');
const path = require('path');
const {
  retrieve
} = require('../../../modules/assistant/knowledge/retrieval.service');

const repositoryRoot = path.resolve(__dirname, '../../../../');
const readKnowledge = (fileName) => JSON.parse(fs.readFileSync(
  path.join(
    repositoryRoot,
    'backend',
    'modules',
    'assistant',
    'knowledge',
    fileName
  ),
  'utf8'
));

describe('P5E HARZAAR assistant brand knowledge', () => {
  test('retrieves HARZAAR as the primary approved identity source', () => {
    const results = retrieve(
      'What is HARZAAR and what does CHOOSE BEYOND mean?',
      'anonymous',
      3
    );

    expect(results[0].id).toBe('public-brand-identity');
  });

  test.each(['records.json', 'index.json'])(
    '%s contains the approved brand contract without an availability guarantee',
    (fileName) => {
      const records = readKnowledge(fileName);
      const brand = records.find((record) => record.id === 'public-brand-identity');

      expect(brand).toBeDefined();
      expect(brand.title).toContain('HARZAAR');
      expect(brand.content).toContain('CHOOSE BEYOND.');
      expect(brand.content).toMatch(/configurable, multi-category commerce platform/i);
      expect(brand.content).toMatch(/actual catalogue and stock determine/i);
      expect(brand.content).toMatch(/must not claim that every product is available/i);
      expect(brand.content).toMatch(/Payment capabilities and external AI providers are independently configured/i);
      expect(brand.content).not.toMatch(/every product is always available/i);
    }
  );
});
