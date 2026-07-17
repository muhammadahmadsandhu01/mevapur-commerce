const Product = require('../models/Product');
const InventoryTransaction = require('../models/InventoryTransaction');
const { logActivity } = require('../middleware/activityLogger');

// @desc    Get inventory list (paginated)
// @route   GET /api/inventory
// @access  Private/Admin
exports.getInventory = async (req, res) => {
  try {
    const { page = 1, limit = 15, search = '', category = '' } = req.query;
    let query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { sku: { $regex: search, $options: 'i' } } // Assuming sku is at root or in variants
      ];
    }
    if (category) {
      query.category = category;
    }

    const skip = (page - 1) * limit;
    const total = await Product.countDocuments(query);
    const pages = Math.ceil(total / limit) || 1;

    const products = await Product.find(query)
      .populate('category', 'name')
      .populate('brand', 'name')
      .sort({ stock: 1 }) // Default: Show lowest stock first
      .skip(skip)
      .limit(Number(limit));

    // Map to frontend expected structure
    const inventoryData = products.map(p => ({
      _id: p._id,
      product: {
        _id: p._id,
        name: p.name,
        sku: p.sku || 'N/A',
        images: p.images || []
      },
      stock: p.stock,
      lowStockThreshold: p.lowStockThreshold || 10,
      variants: p.variants || [],
      lastUpdated: p.updatedAt,
      category: p.category
    }));

    res.json({
      success: true,
      data: inventoryData,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages,
        hasNext: page < pages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Get inventory error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get inventory overview stats
// @route   GET /api/inventory/overview
// @access  Private/Admin
exports.getInventoryOverview = async (req, res) => {
  try {
    const products = await Product.find({}, 'stock price lowStockThreshold category');
    
    const totalProducts = products.length;
    const totalStock = products.reduce((sum, p) => sum + (p.stock || 0), 0);
    const totalValue = products.reduce((sum, p) => sum + ((p.stock || 0) * (p.price || 0)), 0);
    
    const lowStockCount = products.filter(p => p.stock > 0 && p.stock <= (p.lowStockThreshold || 10)).length;
    const outOfStockCount = products.filter(p => p.stock === 0).length;
    const overstockCount = products.filter(p => p.stock > 500).length;

    const categoryStock = await Product.aggregate([
      { $group: {
          _id: '$category',
          totalStock: { $sum: '$stock' },
          totalValue: { $sum: { $multiply: ['$stock', '$price'] } },
          productCount: { $sum: 1 }
        }
      },
      { $sort: { totalValue: -1 } }
    ]);

    const recentTransactions = await InventoryTransaction.find()
      .populate('product', 'name sku')
      .populate('performedBy', 'fullName')
      .sort({ createdAt: -1 })
      .limit(10);

    res.json({
      success: true,
      data: {
        summary: { totalProducts, totalStock, totalValue, lowStockCount, outOfStockCount, overstockCount },
        categoryStock,
        recentTransactions
      }
    });
  } catch (error) {
    console.error('Inventory overview error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get low stock products
// @route   GET /api/inventory/low-stock
// @access  Private/Admin
exports.getLowStock = async (req, res) => {
  try {
    // Find products where stock is less than or equal to their specific threshold
    const products = await Product.find({
      $expr: { $lte: ['$stock', { $ifNull: ['$lowStockThreshold', 10] }] },
      stock: { $gt: 0 } // Exclude completely out of stock if desired, or remove this line
    })
    .populate('category', 'name')
    .sort({ stock: 1 });

    res.json({ success: true, data: products });
  } catch (error) {
    console.error('Low stock error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Adjust stock
// @route   POST /api/inventory/adjust
// @access  Private/Admin
exports.adjustStock = async (req, res) => {
  try {
    const { productId, quantity, type, reason, reference } = req.body;

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const previousStock = product.stock;
    let newStock = previousStock;

    if (type === 'in') {
      newStock = previousStock + quantity;
    } else if (type === 'out') {
      if (quantity > previousStock) {
        return res.status(400).json({ success: false, message: 'Cannot reduce stock below zero' });
      }
      newStock = previousStock - quantity;
    } else if (type === 'adjustment') {
      newStock = quantity; // Direct set
    }

    // Update product stock
    product.stock = newStock;
    await product.save();

    // Create transaction record
    const transaction = await InventoryTransaction.create({
      product: productId,
      type,
      quantity: Math.abs(newStock - previousStock),
      previousStock,
      newStock,
      reason,
      reference: reference || '',
      performedBy: req.user.id,
      metadata: { productName: product.name, sku: product.sku }
    });

    await logActivity(req, 'INVENTORY_ADJUST', 
      `Adjusted stock for ${product.name}: ${previousStock} → ${newStock}`, 
      { productId, type, quantity, reason }
    );

    res.json({
      success: true,
      message: 'Stock adjusted successfully',
      data: {
        transaction,
        product: { id: product._id, name: product.name, previousStock, newStock }
      }
    });
  } catch (error) {
    console.error('Adjust stock error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get stock history for a product or all
// @route   GET /api/inventory/history/:productId?
// @access  Private/Admin
exports.getStockHistory = async (req, res) => {
  try {
    const { productId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const query = productId ? { product: productId } : {};
    
    const skip = (page - 1) * limit;
    const total = await InventoryTransaction.countDocuments(query);
    const pages = Math.ceil(total / limit) || 1;

    const transactions = await InventoryTransaction.find(query)
      .populate('product', 'name sku images')
      .populate('performedBy', 'fullName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    res.json({
      success: true,
      data: transactions,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages,
        hasNext: page < pages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Stock history error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get inventory statistics
// @route   GET /api/inventory/stats
// @access  Private/Admin
exports.getInventoryStats = async (req, res) => {
  try {
    const totalProducts = await Product.countDocuments();
    
    const totalStockAgg = await Product.aggregate([
      { $group: { _id: null, total: { $sum: '$stock' } } }
    ]);
    
    const totalValueAgg = await Product.aggregate([
      { $group: { _id: null, total: { $sum: { $multiply: ['$stock', '$price'] } } } }
    ]);

    // Dynamic low stock count based on threshold
    const lowStock = await Product.countDocuments({
      $expr: { $lte: ['$stock', { $ifNull: ['$lowStockThreshold', 10] }] },
      stock: { $gt: 0 }
    });
    
    const outOfStock = await Product.countDocuments({ stock: 0 });
    const totalTransactions = await InventoryTransaction.countDocuments();
    
    const todayTransactions = await InventoryTransaction.countDocuments({
      createdAt: { $gte: new Date(new Date().setHours(0,0,0,0)) }
    });

    res.json({
      success: true,
      data: {
        totalProducts,
        totalStock: totalStockAgg[0]?.total || 0,
        totalValue: totalValueAgg[0]?.total || 0,
        lowStock,
        outOfStock,
        totalTransactions,
        todayTransactions
      }
    });
  } catch (error) {
    console.error('Inventory stats error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Bulk stock update
// @route   POST /api/inventory/bulk-update
// @access  Private/Admin
exports.bulkStockUpdate = async (req, res) => {
  try {
    const { updates } = req.body; // [{ productId, quantity, type, reason }]

    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ success: false, message: 'Please provide updates array' });
    }

    const results = [];
    for (const update of updates) {
      const product = await Product.findById(update.productId);
      if (!product) continue;

      const previousStock = product.stock;
      let newStock = previousStock;

      if (update.type === 'in') newStock = previousStock + update.quantity;
      else if (update.type === 'out') newStock = Math.max(0, previousStock - update.quantity);
      else if (update.type === 'adjustment') newStock = update.quantity;

      product.stock = newStock;
      await product.save();

      await InventoryTransaction.create({
        product: update.productId,
        type: update.type,
        quantity: Math.abs(newStock - previousStock),
        previousStock,
        newStock,
        reason: update.reason || 'Bulk update',
        performedBy: req.user.id,
        metadata: { productName: product.name, sku: product.sku }
      });

      results.push({ productId: update.productId, previousStock, newStock });
    }

    await logActivity(req, 'INVENTORY_BULK_UPDATE', 
      `Bulk stock update for ${results.length} products`, 
      { updatesCount: results.length }
    );

    res.json({
      success: true,
      message: `Updated ${results.length} products`,
      data: results
    });
  } catch (error) {
    console.error('Bulk update error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};