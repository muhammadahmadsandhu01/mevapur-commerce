const mongoose = require('mongoose');
const Category = require('../../models/Category');

/**
 * CategoryResolver
 * Canonical category resolution service.
 * Supports backward-compatible MongoDB ObjectIds and public human-readable slugs.
 * Ensures strict input bounding, injection resistance, and fail-closed resolution.
 */
class CategoryResolver {
  /**
   * Resolve category identifier (ObjectId or slug) to a Category document.
   *
   * @param {string} identifier - Raw ObjectId string or slug string.
   * @param {object} [options={}]
   * @param {boolean} [options.requireActive=true] - Whether to require isActive === true.
   * @param {boolean} [options.lean=true] - Return plain JS object.
   * @returns {Promise<object|null>} Category document or null if not found/invalid.
   */
  async resolveCategory(identifier, { requireActive = true, lean = true } = {}) {
    if (typeof identifier !== 'string') return null;
    const normalized = identifier.trim();
    if (!normalized || normalized.length > 200) return null;

    // Strict format check: alphanumeric, hyphen, underscore only (rejects operators, arrays, objects, regex)
    if (!/^[a-zA-Z0-9_-]+$/.test(normalized)) return null;

    // Distinguish 24-character hexadecimal MongoDB ObjectId from slug
    const isHexObjectId = /^[0-9a-fA-F]{24}$/.test(normalized);

    const query = requireActive ? { isActive: true } : {};

    if (isHexObjectId) {
      query._id = new mongoose.Types.ObjectId(normalized);
    } else {
      query.slug = normalized.toLowerCase();
    }

    let findQuery = Category.findOne(query);
    if (lean) {
      findQuery = findQuery.lean();
    }
    return await findQuery;
  }

  /**
   * Resolve category identifier to a canonical Category ObjectId.
   *
   * @param {string} identifier
   * @param {object} [options={}]
   * @returns {Promise<mongoose.Types.ObjectId|null>}
   */
  async resolveCategoryToId(identifier, options = {}) {
    const category = await this.resolveCategory(identifier, options);
    return category ? category._id : null;
  }
}

module.exports = new CategoryResolver();
