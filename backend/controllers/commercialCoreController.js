const ShippingZone = require('../models/ShippingZone');
const MarketService = require('../services/MarketService');
const ShippingService = require('../services/order/ShippingService');
const { NotFoundError } = require('../common/errors/AppError');
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
exports.listZones = async (_req, res, next) => {
  try { res.json({ success: true, data: { zones: await ShippingZone.find().sort({ priority: 1, name: 1 }) } }); } catch (error) { next(error); }
};
exports.createZone = async (req, res, next) => {
  try {
    const zone = await ShippingZone.create(req.body);
    await logActivity(req, 'SHIPPING_ZONE_CREATE', `Created shipping zone ${zone.name}`, { zoneId: String(zone._id) });
    res.status(201).json({ success: true, data: { zone } });
  } catch (error) { next(error); }
};
exports.updateZone = async (req, res, next) => {
  try {
    const zone = await ShippingZone.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true, runValidators: true });
    if (!zone) throw new NotFoundError('Shipping zone');
    await logActivity(req, 'SHIPPING_ZONE_UPDATE', `Updated shipping zone ${zone.name}`, { zoneId: String(zone._id) });
    res.json({ success: true, data: { zone } });
  } catch (error) { next(error); }
};
exports.deleteZone = async (req, res, next) => {
  try {
    const zone = await ShippingZone.findByIdAndDelete(req.params.id);
    if (!zone) throw new NotFoundError('Shipping zone');
    await logActivity(req, 'SHIPPING_ZONE_DELETE', `Deleted shipping zone ${zone.name}`, { zoneId: String(zone._id) });
    res.json({ success: true, data: { deleted: true } });
  } catch (error) { next(error); }
};
exports.quoteShipping = async (req, res, next) => {
  try { res.json({ success: true, data: await ShippingService.quote(req.query) }); } catch (error) { next(error); }
};
