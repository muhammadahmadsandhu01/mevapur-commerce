module.exports = {
  shipping: {
    freeThreshold: parseFloat(process.env.FREE_SHIPPING_THRESHOLD) || 1500,
    flatRate: parseFloat(process.env.FLAT_SHIPPING_RATE) || 150
  },
  tax: {
    defaultRate: parseFloat(process.env.DEFAULT_TAX_RATE) || 0 // 0 for now
  },
  stock: {
    reservationTimeMinutes: parseInt(process.env.STOCK_RESERVATION_TIME) || 15
  }
};