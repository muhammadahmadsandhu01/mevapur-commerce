const logger = require('../../common/utils/logger');
const { AppError } = require('../../common/errors/AppError');
const { retrieve } = require('./knowledge/retrieval.service');
const policy = require('./policy/assistantPolicy');
const tools = require('./tools/assistantReadTools');

const CRITICAL_NOTICE =
  'Verify critical order, payment, and refund decisions in the normal dashboard status.';

const withTimeout = async (work, timeoutMs) => {
  let timeout;
  try {
    return await Promise.race([
      work,
      new Promise((resolve, reject) => {
        timeout = setTimeout(
          () => reject(new AppError(
            'Assistant request timed out',
            503,
            'ASSISTANT_TIMEOUT'
          )),
          timeoutMs
        );
      })
    ]);
  } finally {
    clearTimeout(timeout);
  }
};

const safeSource = (record) => ({
  id: record.id,
  title: record.title,
  reference: record.sourceReference,
  kind: 'knowledge'
});

const toolSource = (toolName) => ({
  id: `tool:${toolName}`,
  title: toolName.replace(/([a-z])([A-Z])/g, '$1 $2'),
  reference: 'Role-scoped read-only application tool',
  kind: 'tool'
});

const summarizeToolData = (toolName, data) => {
  if (data === null) return 'No matching record was found for this account.';
  if (Array.isArray(data) && data.length === 0) {
    return 'No matching records were found in the approved read-only scope.';
  }
  const serialized = JSON.stringify(data);
  const bounded = serialized.length > 3500
    ? `${serialized.slice(0, 3500)}...`
    : serialized;
  return `Read-only ${toolName} result: ${bounded}`;
};

const productSearchTerms = (message) => {
  const value = message
    .replace(/\b(find|search|show|browse|buy|products?|catalogue|catalog|for|me|please)\b/gi, ' ')
    .replace(/[^\p{L}\p{N}\s\-']/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return value.length >= 2 ? value.slice(0, 80) : '';
};

const selectCustomerTool = (message, userId) => {
  const orderNumber = message.match(/\bORD-[A-Z0-9-]{8,40}\b/i)?.[0]?.toUpperCase();
  if (userId && orderNumber) {
    return {
      name: 'getCurrentCustomerOrderStatus',
      run: () => tools.getCurrentCustomerOrderStatus({ userId, orderId: orderNumber })
    };
  }
  if (userId && /\b(my|mine)\b.{0,20}\borders?\b/i.test(message)) {
    return {
      name: 'getCurrentCustomerOrders',
      run: () => tools.getCurrentCustomerOrders({ userId })
    };
  }
  if (userId && /\b(my|mine)\b.{0,20}\bpayments?\b/i.test(message)) {
    return {
      name: 'getCurrentCustomerPaymentStatus',
      run: () => tools.getCurrentCustomerPaymentStatus({ userId })
    };
  }
  if (userId && /\b(my|mine)\b.{0,20}\brefunds?\b/i.test(message)) {
    return {
      name: 'getCurrentCustomerRefundStatus',
      run: () => tools.getCurrentCustomerRefundStatus({ userId })
    };
  }
  if (/\b(find|search|show|browse|buy)\b.{0,30}\b(products?|catalogue|catalog)\b/i.test(message)) {
    const query = productSearchTerms(message);
    if (query) {
      return {
        name: 'searchPublicProducts',
        run: () => tools.searchPublicProducts({ query })
      };
    }
  }
  return null;
};

const selectAdminTool = (message) => {
  const definitions = [
    ['getLowStockSummary', /\blow[- ]?stock\b/i],
    ['getInventorySummary', /\binventory\b/i],
    ['getManualPaymentQueueSummary', /\bmanual\b.{0,20}\bpayment/i],
    ['getOrderStatusSummary', /\b(order|pending orders?)\b/i],
    ['getPaymentStatusSummary', /\bpayments?\b/i],
    ['getRefundSummary', /\brefunds?\b/i],
    ['getProviderAvailabilitySummary', /\b(provider|payment method|edition)\b/i],
    ['getProductSummary', /\bproducts?\b/i]
  ];
  const match = definitions.find(([, pattern]) => pattern.test(message));
  if (!match) return null;
  const [name] = match;
  return { name, run: () => tools[name]({}) };
};

class AssistantService {
  constructor(config) {
    this.config = config;
  }

  capabilities(audience = 'anonymous') {
    const providerActive = this.config.mode === 'provider'
      && this.config.provider.active;
    return {
      enabled: this.config.enabled,
      mode: this.config.mode,
      label: this.config.mode === 'retrieval'
        ? 'Help Search'
        : providerActive
          ? 'AI Assistant'
          : 'Help Assistant',
      providerActive,
      readOnly: true,
      audience,
      historyPersisted: false,
      tools: Object.entries(tools.TOOL_DEFINITIONS)
        .filter(([, definition]) => definition.audience.includes(audience))
        .map(([name]) => name)
    };
  }

  async chat({ message, audience, userId, requestId }) {
    const startedAt = Date.now();
    const usedTools = [];
    let outcome = 'rejected';

    try {
      if (!this.config.enabled || this.config.mode === 'disabled') {
        throw new AppError(
          'Help Assistant is not enabled',
          503,
          'ASSISTANT_DISABLED'
        );
      }

      const decision = policy.evaluate(message);
      if (!decision.allowed) {
        outcome = 'policy_denied';
        return {
          mode: this.config.mode,
          label: 'Help Search',
          answer: decision.response,
          sources: [],
          tools: [],
          policyCode: decision.code,
          criticalNotice: CRITICAL_NOTICE
        };
      }

      if (this.config.mode === 'provider') {
        // The provider-neutral contract exists, but P5C intentionally registers
        // no external adapter and therefore cannot make a provider request.
        throw new AppError(
          'Provider mode is configured but no approved provider adapter is active',
          503,
          'ASSISTANT_PROVIDER_INACTIVE'
        );
      }

      const selectedTool = audience === 'admin'
        ? selectAdminTool(message)
        : selectCustomerTool(message, userId);

      if (selectedTool) {
        usedTools.push(selectedTool.name);
        const data = await withTimeout(
          Promise.resolve().then(selectedTool.run),
          this.config.timeoutMs
        );
        outcome = 'tool_answer';
        return {
          mode: 'retrieval',
          label: 'Help Search',
          answer: summarizeToolData(selectedTool.name, data),
          sources: [toolSource(selectedTool.name)],
          tools: usedTools,
          criticalNotice: CRITICAL_NOTICE
        };
      }

      const matches = retrieve(
        message,
        audience,
        this.config.maxContextItems
      );
      if (matches.length === 0) {
        outcome = 'insufficient_information';
        return {
          mode: 'retrieval',
          label: 'Help Search',
          answer:
            'Insufficient information in the approved help sources. Please use '
            + 'the normal dashboard or contact the configured support channel.',
          sources: [],
          tools: [],
          criticalNotice: CRITICAL_NOTICE
        };
      }

      outcome = 'knowledge_answer';
      return {
        mode: 'retrieval',
        label: 'Help Search',
        answer: matches.map((match) => match.content).join('\n\n'),
        sources: matches.map(safeSource),
        tools: [],
        criticalNotice: CRITICAL_NOTICE
      };
    } finally {
      logger.info('Assistant request completed', {
        event: 'ASSISTANT_REQUEST_COMPLETED',
        requestId,
        role: audience,
        mode: this.config.mode,
        toolNames: usedTools,
        outcome,
        latencyMs: Date.now() - startedAt
      });
    }
  }
}

module.exports = AssistantService;
module.exports.withTimeout = withTimeout;
module.exports.selectCustomerTool = selectCustomerTool;
module.exports.selectAdminTool = selectAdminTool;
