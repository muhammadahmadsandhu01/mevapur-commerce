/**
 * @interface IUserRepository
 * Defines the contract for User data access.
 * Implementations can be MongoDB, PostgreSQL, etc.
 */
class IUserRepository {
  async findById(id) {
    throw new Error('Method findById() must be implemented');
  }

  async findByEmail(email) {
    throw new Error('Method findByEmail() must be implemented');
  }

  async create(userData) {
    throw new Error('Method create() must be implemented');
  }

  async update(id, updateData) {
    throw new Error('Method update() must be implemented');
  }

  async delete(id) {
    throw new Error('Method delete() must be implemented');
  }
}

module.exports = IUserRepository;