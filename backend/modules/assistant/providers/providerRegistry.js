const adapters = new Map();

const register = (adapter) => {
  if (!adapter || typeof adapter.name !== 'string') {
    throw new TypeError('Assistant provider adapter must have a name');
  }
  if (typeof adapter.generate !== 'function') {
    throw new TypeError('Assistant provider adapter must implement generate()');
  }
  adapters.set(adapter.name, adapter);
};

const get = (name) => adapters.get(name) || null;
const list = () => [...adapters.keys()];

module.exports = {
  register,
  get,
  list
};
