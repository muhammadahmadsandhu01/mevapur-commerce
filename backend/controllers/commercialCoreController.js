const MarketService = require('../services/MarketService');
const { AppError } = require('../common/errors/AppError');
const { logActivity } = require('../middleware/activityLogger');

exports.getMarket = async (_req, res, next) => {
  try { res.json({ success: true, data: await MarketService.getPublicConfig() }); } catch (error) { next(error); }
};

exports.updateMarket = async (req, res, next) => {
  try {
    const market = await MarketService.update(req.body);
    await logActivity(req, 'MARKET_CONFIG_UPDATE', 'Updated market configuration', { marketId: String(market._id) });
    res.json({ success: true, data: await MarketService.getPublicConfig() });
  } catch (error) { next(error); }
};

exports.listZones = async (_req, _res, next) => {
  try {
    throw new AppError(
      'Direct ShippingZone configuration is disabled. Configure and view shipping rules through CommerceConfiguration version drafts.',
      409,
      'LEGACY_SHIPPING_CONFIGURATION_DISABLED'
    );
  } catch (error) { next(error); }
};

exports.createZone = async (_req, _res, next) => {
  try {
    throw new AppError(
      'Direct ShippingZone mutation is disabled. Configure shipping rules through CommerceConfiguration version drafts.',
      409,
      'LEGACY_SHIPPING_CONFIGURATION_DISABLED'
    );
  } catch (error) { next(error); }
};

exports.updateZone = async (_req, _res, next) => {
  try {
    throw new AppError(
      'Direct ShippingZone mutation is disabled. Configure shipping rules through CommerceConfiguration version drafts.',
      409,
      'LEGACY_SHIPPING_CONFIGURATION_DISABLED'
    );
  } catch (error) { next(error); }
};

exports.deleteZone = async (_req, _res, next) => {
  try {
    throw new AppError(
      'Direct ShippingZone mutation is disabled. Configure shipping rules through CommerceConfiguration version drafts.',
      409,
      'LEGACY_SHIPPING_CONFIGURATION_DISABLED'
    );
  } catch (error) { next(error); }
};

exports.quoteShipping = async (_req, _res, next) => {
  try {
    throw new AppError(
      'Legacy GET /shipping/quote is disabled. Use POST /api/commerce/checkout/quote for governed checkout quotes.',
      409,
      'LEGACY_SHIPPING_CONFIGURATION_DISABLED'
    );
  } catch (error) { next(error); }
};
