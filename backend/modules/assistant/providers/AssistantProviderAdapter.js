class AssistantProviderAdapter {
  constructor(name) {
    if (new.target === AssistantProviderAdapter) {
      throw new TypeError('AssistantProviderAdapter is abstract');
    }
    this.name = name;
  }

  async generate() {
    throw new Error('Assistant provider adapter must implement generate()');
  }
}

module.exports = AssistantProviderAdapter;
