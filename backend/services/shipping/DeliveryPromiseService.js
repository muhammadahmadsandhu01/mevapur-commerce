/**
 * @file DeliveryPromiseService.js
 * @description Computes authoritative, deterministic delivery promise dates and windows.
 * Handles order cutoff times, warehouse dispatch scheduling, transit ranges, and remote extensions.
 */

class DeliveryPromiseService {
  /**
   * Adds business days (skipping Saturday and Sunday) to a given starting date.
   * @param {Date} startDate
   * @param {number} daysToAdd
   * @returns {Date}
   */
  addBusinessDays(startDate, daysToAdd) {
    const d = new Date(startDate);
    let remaining = Math.max(0, daysToAdd);

    while (remaining > 0) {
      d.setUTCDate(d.getUTCDate() + 1);
      const dayOfWeek = d.getUTCDay(); // 0 = Sun, 6 = Sat
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        remaining -= 1;
      }
    }
    return d;
  }

  /**
   * Adds calendar days to a given starting date.
   * @param {Date} startDate
   * @param {number} daysToAdd
   * @returns {Date}
   */
  addCalendarDays(startDate, daysToAdd) {
    const d = new Date(startDate);
    d.setUTCDate(d.getUTCDate() + Math.max(0, daysToAdd));
    return d;
  }

  /**
   * Calculates dispatch date and delivery window promise.
   * @param {Object} params
   * @param {Date|string} [params.orderDate=new Date()] - Timestamp when order/quote was created
   * @param {string} [params.cutoffTime='14:00'] - Warehouse order cutoff time (HH:mm)
   * @param {string} [params.timezone='UTC'] - IANA timezone identifier
   * @param {number} [params.deliveryMinDays=2] - Minimum transit days
   * @param {number} [params.deliveryMaxDays=5] - Maximum transit days
   * @param {boolean} [params.isRemote=false] - Whether destination is classified as remote
   * @param {number} [params.remoteDeliveryMinDays=null] - Minimum transit days for remote areas
   * @param {number} [params.remoteDeliveryMaxDays=null] - Maximum transit days for remote areas
   * @param {boolean} [params.businessDaysOnly=true] - Whether transit days count only business days
   * @returns {Object} Delivery promise details
   */
  calculatePromise({
    orderDate = new Date(),
    cutoffTime = '14:00',
    timezone = 'UTC',
    deliveryMinDays = 2,
    deliveryMaxDays = 5,
    isRemote = false,
    remoteDeliveryMinDays = null,
    remoteDeliveryMaxDays = null,
    businessDaysOnly = true
  } = {}) {
    const baseDate = new Date(orderDate);
    const validBase = Number.isNaN(baseDate.getTime()) ? new Date() : baseDate;

    // Parse cutoff time HH:mm
    const [cutoffHours, cutoffMinutes] = (cutoffTime || '14:00').split(':').map((n) => parseInt(n, 10) || 0);

    // Get order hours and minutes in specified timezone
    let orderHours = validBase.getUTCHours();
    let orderMinutes = validBase.getUTCMinutes();
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone || 'UTC',
        hour: 'numeric',
        minute: 'numeric',
        hour12: false
      });
      const parts = formatter.formatToParts(validBase);
      const hPart = parts.find((p) => p.type === 'hour');
      const mPart = parts.find((p) => p.type === 'minute');
      if (hPart) orderHours = parseInt(hPart.value, 10);
      if (mPart) orderMinutes = parseInt(mPart.value, 10);
    } catch {
      // Fallback to UTC if timezone is unrecognized
    }

    const orderTotalMinutes = orderHours * 60 + orderMinutes;
    const cutoffTotalMinutes = cutoffHours * 60 + cutoffMinutes;
    const isPastCutoff = orderTotalMinutes >= cutoffTotalMinutes;

    // Determine initial dispatch date
    const dispatchBase = new Date(validBase);
    dispatchBase.setUTCHours(12, 0, 0, 0); // Normalize to midday UTC

    let dispatchDate;
    if (isPastCutoff) {
      dispatchDate = businessDaysOnly
        ? this.addBusinessDays(dispatchBase, 1)
        : this.addCalendarDays(dispatchBase, 1);
    } else {
      // Check if current day is weekend
      const dayOfWeek = dispatchBase.getUTCDay();
      if (businessDaysOnly && (dayOfWeek === 0 || dayOfWeek === 6)) {
        dispatchDate = this.addBusinessDays(dispatchBase, 1);
      } else {
        dispatchDate = dispatchBase;
      }
    }

    // Determine transit days
    let minDays = Number(deliveryMinDays) || 1;
    let maxDays = Number(deliveryMaxDays) || Math.max(minDays, 3);

    if (isRemote) {
      if (remoteDeliveryMinDays != null) minDays = Number(remoteDeliveryMinDays);
      if (remoteDeliveryMaxDays != null) maxDays = Number(remoteDeliveryMaxDays);
      if (remoteDeliveryMinDays == null && remoteDeliveryMaxDays == null) {
        minDays += 2;
        maxDays += 3;
      }
    }

    if (maxDays < minDays) {
      maxDays = minDays;
    }

    const minDeliveryDate = businessDaysOnly
      ? this.addBusinessDays(dispatchDate, minDays)
      : this.addCalendarDays(dispatchDate, minDays);

    const maxDeliveryDate = businessDaysOnly
      ? this.addBusinessDays(dispatchDate, maxDays)
      : this.addCalendarDays(dispatchDate, maxDays);

    const isSameDayDispatch = !isPastCutoff && dispatchDate.toDateString() === dispatchBase.toDateString();

    return {
      orderDate: validBase.toISOString(),
      dispatchDate: dispatchDate.toISOString(),
      minDeliveryDate: minDeliveryDate.toISOString(),
      maxDeliveryDate: maxDeliveryDate.toISOString(),
      minDays,
      maxDays,
      isSameDayDispatch,
      isPastCutoff,
      isRemote,
      promiseText: `${minDays}-${maxDays} business days`
    };
  }
}

module.exports = DeliveryPromiseService;
module.exports.DeliveryPromiseService = DeliveryPromiseService;
