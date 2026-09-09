const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const {
  CANONICAL_AUDIENCES,
  REQUIRED_FIELDS,
  REQUIRED_STRING_FIELDS,
  FORBIDDEN_CONTENT_REGEX,
  validateKnowledgeRecords,
  buildKnowledgeIndex,
  serializeKnowledgeIndex,
  checkKnowledgeIndex,
  runCli,
  DEFAULT_SOURCE_PATH,
  DEFAULT_OUTPUT_PATH
} = require('../../../scripts/build-assistant-knowledge-index');

describe('P5C assistant knowledge index integrity and drift gate', () => {
  const getFileSha256 = (filePath) => {
    const buffer = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(buffer).digest('hex');
  };

  const validSampleRecord = {
    id: 'sample-record-1',
    title: 'Sample title',
    audience: ['customer', 'anonymous'],
    category: 'sample-category',
    content: 'Sample content explaining commerce functionality.',
    sourceReference: 'docs/SAMPLE_GUIDE.md'
  };

  const validSampleRecord2 = {
    id: 'sample-record-2',
    title: 'Another title',
    audience: ['admin'],
    category: 'operations',
    content: 'Administrative operations guidance.',
    sourceReference: 'docs/OPERATIONS_GUIDE.md'
  };

  describe('Section A: Determinism and Canonical Ordering', () => {
    test('same valid records produce identical index objects', () => {
      const records = [validSampleRecord, validSampleRecord2];
      const index1 = buildKnowledgeIndex(records);
      const index2 = buildKnowledgeIndex(records);

      expect(index1).toEqual(index2);
    });

    test('same valid records produce byte-identical serialized JSON', () => {
      const records = [validSampleRecord, validSampleRecord2];
      const json1 = serializeKnowledgeIndex(buildKnowledgeIndex(records));
      const json2 = serializeKnowledgeIndex(buildKnowledgeIndex(records));

      expect(json1).toBe(json2);
    });

    test('reordered source records produce identical canonical index output', () => {
      const orderA = [validSampleRecord, validSampleRecord2];
      const orderB = [validSampleRecord2, validSampleRecord];

      const indexA = buildKnowledgeIndex(orderA);
      const indexB = buildKnowledgeIndex(orderB);

      expect(indexA).toEqual(indexB);
      expect(serializeKnowledgeIndex(indexA)).toBe(serializeKnowledgeIndex(indexB));
    });

    test('reordered audience arrays produce canonical sorted audience output', () => {
      const recordA = { ...validSampleRecord, audience: ['customer', 'anonymous'] };
      const recordB = { ...validSampleRecord, audience: ['anonymous', 'customer'] };

      const [normalizedA] = buildKnowledgeIndex([recordA]);
      const [normalizedB] = buildKnowledgeIndex([recordB]);

      expect(normalizedA.audience).toEqual(['anonymous', 'customer']);
      expect(normalizedB.audience).toEqual(['anonymous', 'customer']);
      expect(normalizedA).toEqual(normalizedB);
    });

    test('duplicate audience entries are deduplicated and sorted', () => {
      const record = { ...validSampleRecord, audience: ['customer', 'anonymous', 'customer'] };
      const [normalized] = buildKnowledgeIndex([record]);

      expect(normalized.audience).toEqual(['anonymous', 'customer']);
    });
  });

  describe('Section B: Validation and Forbidden Content Defense', () => {
    test('rejects non-array or empty input', () => {
      expect(() => validateKnowledgeRecords(null)).toThrow('ASSISTANT_INDEX_SOURCE_EMPTY');
      expect(() => validateKnowledgeRecords(undefined)).toThrow('ASSISTANT_INDEX_SOURCE_EMPTY');
      expect(() => validateKnowledgeRecords({})).toThrow('ASSISTANT_INDEX_SOURCE_EMPTY');
      expect(() => validateKnowledgeRecords([])).toThrow('ASSISTANT_INDEX_SOURCE_EMPTY');
    });

    test('rejects non-object records', () => {
      expect(() => validateKnowledgeRecords([null])).toThrow('ASSISTANT_INDEX_RECORD_INVALID');
      expect(() => validateKnowledgeRecords(['string'])).toThrow('ASSISTANT_INDEX_RECORD_INVALID');
      expect(() => validateKnowledgeRecords([123])).toThrow('ASSISTANT_INDEX_RECORD_INVALID');
      expect(() => validateKnowledgeRecords([[]])).toThrow('ASSISTANT_INDEX_RECORD_INVALID');
    });

    test('rejects missing or non-string required fields', () => {
      for (const field of REQUIRED_STRING_FIELDS) {
        const missing = { ...validSampleRecord };
        delete missing[field];
        expect(() => validateKnowledgeRecords([missing])).toThrow('ASSISTANT_INDEX_RECORD_INVALID');

        const nonString = { ...validSampleRecord, [field]: 12345 };
        expect(() => validateKnowledgeRecords([nonString])).toThrow('ASSISTANT_INDEX_RECORD_INVALID');

        const emptyString = { ...validSampleRecord, [field]: '   ' };
        expect(() => validateKnowledgeRecords([emptyString])).toThrow('ASSISTANT_INDEX_RECORD_INVALID');
      }
    });

    test('rejects invalid audience specifications', () => {
      expect(() => validateKnowledgeRecords([{ ...validSampleRecord, audience: null }]))
        .toThrow('ASSISTANT_INDEX_RECORD_INVALID');
      expect(() => validateKnowledgeRecords([{ ...validSampleRecord, audience: [] }]))
        .toThrow('ASSISTANT_INDEX_RECORD_INVALID');
      expect(() => validateKnowledgeRecords([{ ...validSampleRecord, audience: ['superuser'] }]))
        .toThrow('ASSISTANT_INDEX_RECORD_INVALID');
      expect(() => validateKnowledgeRecords([{ ...validSampleRecord, audience: ['customer', 'guest'] }]))
        .toThrow('ASSISTANT_INDEX_RECORD_INVALID');
      expect(() => validateKnowledgeRecords([{ ...validSampleRecord, audience: [123] }]))
        .toThrow('ASSISTANT_INDEX_RECORD_INVALID');
    });

    test('rejects duplicate record IDs', () => {
      const duplicateRecords = [
        validSampleRecord,
        { ...validSampleRecord2, id: validSampleRecord.id }
      ];
      expect(() => validateKnowledgeRecords(duplicateRecords)).toThrow('ASSISTANT_INDEX_DUPLICATE_ID');
    });

    test('rejects forbidden secrets without leaking secret value in error', () => {
      const forbiddenSamples = [
        { field: 'content', secret: 'mongodb+srv://admin:pass@cluster.test/db' },
        { field: 'content', secret: 'authorization: Basic dXNlcjpwYXNz' },
        { field: 'content', secret: 'Bearer eyJhbGciOiJIUzI1NiJ9.synthetic' },
        { field: 'sourceReference', secret: 'api_key = synthetic-super-secret-key-12345' },
        { field: 'title', secret: 'password : my-secret-password-xyz' },
        { field: 'content', secret: 'P5C_PRE_CHANGE_WORKING_TREE marker detected' }
      ];

      for (const { field, secret } of forbiddenSamples) {
        const taintedRecord = {
          ...validSampleRecord,
          [field]: `Guidance text with ${secret}`
        };

        let thrownError = null;
        try {
          validateKnowledgeRecords([taintedRecord]);
        } catch (err) {
          thrownError = err;
        }

        expect(thrownError).not.toBeNull();
        expect(thrownError.message).toContain('ASSISTANT_INDEX_FORBIDDEN_CONTENT');
        expect(thrownError.message).not.toContain(secret);
      }
    });
  });

  describe('Section C: Committed Artifact Parity and Contract', () => {
    test('committed index.json matches canonical generated output byte-for-byte', () => {
      const rawRecords = fs.readFileSync(DEFAULT_SOURCE_PATH, 'utf8');
      const records = JSON.parse(rawRecords);

      const canonicalIndex = buildKnowledgeIndex(records);
      const expectedSerialized = serializeKnowledgeIndex(canonicalIndex);

      const committedRawIndex = fs.readFileSync(DEFAULT_OUTPUT_PATH, 'utf8');
      const committedIndex = JSON.parse(committedRawIndex);

      expect(canonicalIndex).toEqual(committedIndex);
      expect(expectedSerialized).toBe(committedRawIndex);
    });

    test('every committed record conforms strictly to knowledge contract', () => {
      const committedRaw = fs.readFileSync(DEFAULT_OUTPUT_PATH, 'utf8');
      const records = JSON.parse(committedRaw);

      expect(Array.isArray(records)).toBe(true);
      expect(records.length).toBeGreaterThan(0);

      const knownKeys = new Set(REQUIRED_FIELDS);

      for (const record of records) {
        for (const field of REQUIRED_STRING_FIELDS) {
          expect(typeof record[field]).toBe('string');
          expect(record[field].trim().length).toBeGreaterThan(0);
        }

        expect(Array.isArray(record.audience)).toBe(true);
        expect(record.audience.length).toBeGreaterThan(0);
        for (const aud of record.audience) {
          expect(CANONICAL_AUDIENCES.has(aud)).toBe(true);
        }

        const recordKeys = Object.keys(record);
        expect(recordKeys.sort()).toEqual([...knownKeys].sort());
        expect(FORBIDDEN_CONTENT_REGEX.test(JSON.stringify(record))).toBe(false);
      }
    });
  });

  describe('Section D: Drift Detection Gate API', () => {
    test('checkKnowledgeIndex passes on committed repository files', () => {
      const result = checkKnowledgeIndex({
        sourcePath: DEFAULT_SOURCE_PATH,
        targetPath: DEFAULT_OUTPUT_PATH
      });

      expect(result.valid).toBe(true);
      expect(result.recordCount).toBeGreaterThan(0);
      expect(Array.isArray(result.canonicalIndex)).toBe(true);
    });

    test('checkKnowledgeIndex detects drift when target is modified', () => {
      const records = JSON.parse(fs.readFileSync(DEFAULT_SOURCE_PATH, 'utf8'));
      const canonicalIndex = buildKnowledgeIndex(records);

      // Create synthetic drifted target
      const driftedIndex = [...canonicalIndex];
      driftedIndex[0] = { ...driftedIndex[0], title: 'Drifted synthetic title' };

      const tempTarget = path.resolve(__dirname, '../../../scratch_test_drift.json');
      fs.writeFileSync(tempTarget, JSON.stringify(driftedIndex, null, 2) + '\n', 'utf8');

      try {
        expect(() => checkKnowledgeIndex({
          sourcePath: DEFAULT_SOURCE_PATH,
          targetPath: tempTarget
        })).toThrow('ASSISTANT_INDEX_DRIFT_DETECTED');
      } finally {
        if (fs.existsSync(tempTarget)) {
          fs.unlinkSync(tempTarget);
        }
      }
    });

    test('checkKnowledgeIndex throws when source or target does not exist', () => {
      expect(() => checkKnowledgeIndex({
        sourcePath: 'non_existent_source.json',
        targetPath: DEFAULT_OUTPUT_PATH
      })).toThrow('ASSISTANT_INDEX_SOURCE_NOT_FOUND');

      expect(() => checkKnowledgeIndex({
        sourcePath: DEFAULT_SOURCE_PATH,
        targetPath: 'non_existent_target.json'
      })).toThrow('ASSISTANT_INDEX_TARGET_NOT_FOUND');
    });
  });

  describe('Section E: CLI Invocation and Import Safety', () => {
    test('runCli with --check returns 0 without writing files', () => {
      const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);

      try {
        const exitCode = runCli(['--check']);
        expect(exitCode).toBe(0);
        expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('ASSISTANT_KNOWLEDGE_INDEX_PASS'));
      } finally {
        stdoutSpy.mockRestore();
        stderrSpy.mockRestore();
      }
    });

    test('runCli without arguments returns 1 and prints usage', () => {
      const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);

      try {
        const exitCode = runCli([]);
        expect(exitCode).toBe(1);
        expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Missing required mode'));
      } finally {
        stderrSpy.mockRestore();
      }
    });

    test('runCli with invalid argument returns 1', () => {
      const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);

      try {
        const exitCode = runCli(['--invalid-mode']);
        expect(exitCode).toBe(1);
        expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown mode'));
      } finally {
        stderrSpy.mockRestore();
      }
    });

    test('CLI process execution via child_process succeeds for --check', () => {
      const scriptPath = path.resolve(__dirname, '../../../scripts/build-assistant-knowledge-index.js');
      const result = spawnSync('node', [scriptPath, '--check'], {
        encoding: 'utf8',
        cwd: path.resolve(__dirname, '../../..')
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('ASSISTANT_KNOWLEDGE_INDEX_PASS');
    });

    test('CLI process execution via child_process fails for no-argument invocation', () => {
      const scriptPath = path.resolve(__dirname, '../../../scripts/build-assistant-knowledge-index.js');
      const result = spawnSync('node', [scriptPath], {
        encoding: 'utf8',
        cwd: path.resolve(__dirname, '../../..')
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Missing required mode');
    });

    test('repository records.json and index.json SHA-256 remain unchanged', () => {
      const recordsHash = getFileSha256(DEFAULT_SOURCE_PATH);
      const indexHash = getFileSha256(DEFAULT_OUTPUT_PATH);

      expect(recordsHash).toBe('797553c39cb9db4cf702ce6be4b210b9e7a46a1b27b88179110f0d162dcd312f');
      expect(indexHash).toBe('5fd001bfc46175a90231698a632360b6ffe09c7512bf0222f4b2766a69b5c73c');
    });
  });
});
