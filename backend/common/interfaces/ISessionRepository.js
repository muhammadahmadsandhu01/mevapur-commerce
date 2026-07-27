class ISessionRepository {
  async create(sessionData) {
    throw new Error('Method create() must be implemented');
  }

  async findById(id) {
    throw new Error('Method findById() must be implemented');
  }

  async findByUserId(userId) {
    throw new Error('Method findByUserId() must be implemented');
  }

  async update(id, updateData) {
    throw new Error('Method update() must be implemented');
  }

  async delete(id) {
    throw new Error('Method delete() must be implemented');
  }
  
  async revokeAllUserTokens(userId) {
    throw new Error('Method revokeAllUserTokens() must be implemented');
  }
}

module.exports = ISessionRepository;