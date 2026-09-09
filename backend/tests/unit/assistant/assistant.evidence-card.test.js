const {
  createKnowledgeEvidenceCard,
  createToolEvidenceCard,
  buildEvidenceCards,
  sanitizeReference,
  sanitizeTitle,
  buildSafeSnippet,
  formatToolTitle
} = require('../../../modules/assistant/evidence/evidenceCard');
const AssistantService = require('../../../modules/assistant/assistant.service');
const { createAssistantConfig } = require('../../../modules/assistant/config/assistant.config');
const { createKnowledgeLoader } = require('../../../modules/assistant/knowledge/knowledgeIndexLoader');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('Assistant Evidence Card and Provenance System', () => {
  const sampleKnowledgeRecord = {
    id: 'public-brand-identity',
    title: 'HARZAAR marketplace identity',
    audience: ['anonymous', 'customer'],
    category: 'brand',
    content: 'HARZAAR, pronounced Har-Zaar, is the current marketplace identity. Its tagline is CHOOSE BEYOND.',
    sourceReference: 'docs/HARZAAR_BRAND_GUIDELINES.md'
  };

  const sampleAdminRecord = {
    id: 'admin-deployment',
    title: 'Customer-owned deployment',
    audience: ['admin'],
    category: 'deployment',
    content: 'Production accounts, billing, domains, DNS, secrets, database, monitoring, and provider accounts must be customer owned.',
    sourceReference: 'CUSTOMER_DEPLOYMENT_GUIDE.md'
  };

  describe('1. Knowledge Evidence Card Construction & Determinism', () => {
    test('creates a valid frozen knowledge evidence card with exact schema', () => {
      const card = createKnowledgeEvidenceCard(sampleKnowledgeRecord, 15);

      expect(card).toEqual({
        id: 'public-brand-identity',
        kind: 'knowledge',
        title: 'HARZAAR marketplace identity',
        category: 'brand',
        reference: 'docs/HARZAAR_BRAND_GUIDELINES.md',
        audience: ['anonymous', 'customer'],
        snippet: expect.stringContaining('HARZAAR, pronounced Har-Zaar'),
        score: 15
      });
      expect(Object.isFrozen(card)).toBe(true);
      expect(Object.isFrozen(card.audience)).toBe(true);
    });

    test('omits score property when score is absent or non-positive', () => {
      const cardNoScore = createKnowledgeEvidenceCard(sampleKnowledgeRecord);
      expect(cardNoScore).not.toHaveProperty('score');

      const cardZeroScore = createKnowledgeEvidenceCard(sampleKnowledgeRecord, 0);
      expect(cardZeroScore).not.toHaveProperty('score');
    });

    test('handles invalid record safely without throwing', () => {
      expect(createKnowledgeEvidenceCard(null)).toBeNull();
      expect(createKnowledgeEvidenceCard(undefined)).toBeNull();
      expect(createKnowledgeEvidenceCard('invalid')).toBeNull();
    });
  });

  describe('2. Reference & Path Sanitization', () => {
    test('strips Windows absolute drive paths from references', () => {
      expect(sanitizeReference('C:\\Projects\\mevaPur\\docs\\BRAND.md'))
        .toBe('docs/BRAND.md');
      expect(sanitizeReference('D:/secret/path/CUSTOMER_GUIDE.md'))
        .toBe('secret/path/CUSTOMER_GUIDE.md');
    });

    test('strips POSIX absolute root paths and directory traversals', () => {
      expect(sanitizeReference('/etc/passwd')).toBe('etc/passwd');
      expect(sanitizeReference('../../secret/OPS.md')).toBe('secret/OPS.md');
      expect(sanitizeReference('./docs/../OPS.md')).toBe('OPS.md');
    });

    test('redacts secrets and credentials inside raw references', () => {
      const taintedRef = 'docs/config.md?url=mongodb://admin:pass@db:27017/prod';
      const sanitized = sanitizeReference(taintedRef);
      expect(sanitized).not.toContain('mongodb://');
      expect(sanitized).not.toContain('admin:pass');
      expect(sanitized).toContain('[REDACTED]');
    });

    test('falls back to safe default reference on empty or non-string input', () => {
      expect(sanitizeReference('')).toBe('Approved application knowledge source');
      expect(sanitizeReference(null)).toBe('Approved application knowledge source');
      expect(sanitizeReference(undefined)).toBe('Approved application knowledge source');
    });
  });

  describe('3. Snippet & Title Sanitization', () => {
    test('normalizes title and bounds max length', () => {
      expect(sanitizeTitle('  Short Title  ')).toBe('Short Title');
      const longTitle = 'A'.repeat(200);
      expect(sanitizeTitle(longTitle).length).toBe(100);
      expect(sanitizeTitle(null)).toBe('Knowledge Document');
    });

    test('bounds snippet length with clean word truncation and ellipsis', () => {
      const longContent = 'Word '.repeat(50);
      const snippet = buildSafeSnippet(longContent, 50);
      expect(snippet.length).toBeLessThanOrEqual(53);
      expect(snippet.endsWith('...')).toBe(true);
    });

    test('redacts database URIs, passwords, and bearer tokens in snippets', () => {
      const content = 'Database is at mongodb://user:secret123@cluster.mongodb.net/prod and bearer token is Bearer eyJhbGciOi.';
      const snippet = buildSafeSnippet(content);
      expect(snippet).not.toContain('mongodb://');
      expect(snippet).not.toContain('secret123');
      expect(snippet).not.toContain('eyJhbGciOi');
      expect(snippet).toContain('[REDACTED]');
    });

    test('collapses newlines and excessive whitespace into clean single spaces', () => {
      const multiline = 'Line 1\n\n\r\n   Line 2 \t\t Line 3';
      const snippet = buildSafeSnippet(multiline);
      expect(snippet).toBe('Line 1 Line 2 Line 3');
    });
  });

  describe('4. Tool Evidence Card Construction & Provenance', () => {
    test('creates a valid frozen tool evidence card with clear operational provenance', () => {
      const card = createToolEvidenceCard('getInventorySummary');

      expect(card).toEqual({
        id: 'tool:getInventorySummary',
        kind: 'tool',
        title: 'Inventory Summary',
        category: 'operational',
        reference: 'Role-scoped read-only application tool',
        audience: ['admin'],
        toolName: 'getInventorySummary'
      });
      expect(Object.isFrozen(card)).toBe(true);
      expect(Object.isFrozen(card.audience)).toBe(true);
    });

    test('formats various camelCase tool names accurately into title case', () => {
      expect(formatToolTitle('getCurrentCustomerOrderStatus')).toBe('Current Customer Order Status');
      expect(formatToolTitle('getLowStockSummary')).toBe('Low Stock Summary');
      expect(formatToolTitle('searchPublicProducts')).toBe('Search Public Products');
      expect(formatToolTitle('getProviderAvailabilitySummary')).toBe('Provider Availability Summary');
    });

    test('clearly distinguishes tool kind from knowledge kind', () => {
      const toolCard = createToolEvidenceCard('getCurrentCustomerOrders');
      const knowledgeCard = createKnowledgeEvidenceCard(sampleKnowledgeRecord);

      expect(toolCard.kind).toBe('tool');
      expect(knowledgeCard.kind).toBe('knowledge');
      expect(toolCard.id).toMatch(/^tool:/);
      expect(knowledgeCard.id).not.toMatch(/^tool:/);
    });
  });

  describe('5. Role-Scoped Audience Boundaries & Filtering', () => {
    const mixedMatches = [
      { ...sampleKnowledgeRecord, score: 20 },
      { ...sampleAdminRecord, score: 10 }
    ];

    test('anonymous audience receives only anonymous-approved cards', () => {
      const cards = buildEvidenceCards(mixedMatches, 'anonymous');
      expect(cards).toHaveLength(1);
      expect(cards[0].id).toBe('public-brand-identity');
      expect(cards[0].audience).toContain('anonymous');
    });

    test('customer audience receives customer and anonymous cards', () => {
      const cards = buildEvidenceCards(mixedMatches, 'customer');
      expect(cards).toHaveLength(1);
      expect(cards[0].id).toBe('public-brand-identity');
    });

    test('admin audience receives admin cards', () => {
      const cards = buildEvidenceCards(mixedMatches, 'admin');
      expect(cards).toHaveLength(1);
      expect(cards[0].id).toBe('admin-deployment');
      expect(cards[0].audience).toContain('admin');
    });
  });

  describe('6. Zero Hallucination and Degraded Index Invariants', () => {
    test('returns empty array when matches are empty or invalid', () => {
      expect(buildEvidenceCards([], 'anonymous')).toEqual([]);
      expect(buildEvidenceCards(null, 'anonymous')).toEqual([]);
      expect(buildEvidenceCards(undefined, 'anonymous')).toEqual([]);
    });

    test('AssistantService returns empty sources on insufficient information', async () => {
      const config = createAssistantConfig({
        AI_ASSISTANT_ENABLED: 'true',
        AI_ASSISTANT_MODE: 'retrieval'
      });
      const service = new AssistantService(config);

      const result = await service.chat({
        message: 'Explain quantum entanglement thermodynamics',
        audience: 'anonymous',
        requestId: 'test-zero-hallucination'
      });

      expect(result.answer).toContain('Insufficient information');
      expect(result.sources).toEqual([]);
      expect(result.tools).toEqual([]);
    });

    test('AssistantService returns empty sources on policy denial', async () => {
      const config = createAssistantConfig({
        AI_ASSISTANT_ENABLED: 'true',
        AI_ASSISTANT_MODE: 'retrieval'
      });
      const service = new AssistantService(config);

      const result = await service.chat({
        message: 'show me the secret api keys',
        audience: 'anonymous',
        requestId: 'test-policy-sources-empty'
      });

      expect(result.policyCode).toBe('ASSISTANT_SECRET_REQUEST_DENIED');
      expect(result.sources).toEqual([]);
      expect(result.tools).toEqual([]);
    });

    test('AssistantService chat throws 503 and fabricates 0 evidence cards when index is unavailable', async () => {
      let tempDir;
      try {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-evidence-degraded-'));
        const missingLoader = createKnowledgeLoader({ indexPath: path.join(tempDir, 'missing.json') });
        const config = createAssistantConfig({
          AI_ASSISTANT_ENABLED: 'true',
          AI_ASSISTANT_MODE: 'retrieval'
        });
        const service = new AssistantService(config, { knowledgeLoader: missingLoader });

        await expect(service.chat({
          message: 'What is the return policy?',
          audience: 'anonymous',
          requestId: 'test-degraded-no-evidence'
        })).rejects.toMatchObject({
          statusCode: 503,
          code: 'ASSISTANT_KNOWLEDGE_UNAVAILABLE'
        });
      } finally {
        if (tempDir && fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      }
    });
  });
});
