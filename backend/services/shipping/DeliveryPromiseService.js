/**
 * @file DeliveryPromiseService.js
 * @description Computes authoritative, deterministic delivery promise dates and windows.
 * Governed strictly by shipping rule properties (processingCutoffLocal, workingDays,
 * processingMinBusinessDays, processingMaxBusinessDays, deliveryMinDays, deliveryMaxDays,
 * remoteDeliveryMinDays, remoteDeliveryMaxDays) and origin location timeZone.
 *
 * Prohibits hardcoded implicit assumptions (no hardcoded 14:00, no automatic Mon-Fri,
 * no express/standard heuristic durations, no server-local timezone, no UTC fallback).
 *
 * Holiday Support: FOUNDATION_ONLY (no runtime holiday calendar currently modeled).
 */

const { AppError } = require('../../common/errors/AppError');

class DeliveryPromiseService {
  /**
   * Validates whether a given string is a valid IANA timezone.
   * @param {string} tz
   * @returns {boolean}
   */
  isValidTimeZone(tz) {
    if (!tz || typeof tz !== 'string' || !tz.trim()) return false;
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz.trim() });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Extracts local calendar date and time parts in the specified origin timezone.
   * Deterministically handles DST without external libraries.
   * @param {Date} date
   * @param {string} timeZone
   * @returns {Object}
   */
  getZonedParts(date, timeZone) {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone.trim(),
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false
    });

    const parts = formatter.formatToParts(date);
    const partMap = {};
    for (const p of parts) {
      partMap[p.type] = p.value;
    }

    const year = parseInt(partMap.year, 10);
    const month = parseInt(partMap.month, 10); // 1-12
    const day = parseInt(partMap.day, 10); // 1-31
    let hour = parseInt(partMap.hour, 10);
    if (hour === 24) hour = 0;
    const minute = parseInt(partMap.minute, 10);
    const second = parseInt(partMap.second, 10);

    // Reference UTC midday date to safely calculate day-of-week and calendar advances
    const utcDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
    const jsDay = utcDate.getUTCDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
    const isoDay = jsDay === 0 ? 7 : jsDay; // 1 = Mon ... 7 = Sun

    return {
      year,
      month,
      day,
      hour,
      minute,
      second,
      isoDay,
      utcMiddayDate: utcDate,
      dateString: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      timeString: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
    };
  }

  /**
   * Adds working days using a governed working-day calendar.
   * @param {Date} startDate - Midday UTC reference date
   * @param {number} daysToAdd - Non-negative integer
   * @param {Set<number>} workingDaysSet - Set of ISO weekday numbers (1=Mon..7=Sun)
   * @returns {Date}
   */
  addWorkingDays(startDate, daysToAdd, workingDaysSet) {
    const d = new Date(startDate);
    let remaining = Math.max(0, parseInt(daysToAdd, 10) || 0);

    while (remaining > 0) {
      d.setUTCDate(d.getUTCDate() + 1);
      const jsDay = d.getUTCDay();
      const isoDay = jsDay === 0 ? 7 : jsDay;
      if (workingDaysSet.has(isoDay)) {
        remaining -= 1;
      }
    }
    return d;
  }

  /**
   * Advances a reference date to the current date if it is a working day,
   * or the immediate next working day if it is currently a non-working day.
   * @param {Date} startDate
   * @param {Set<number>} workingDaysSet
   * @returns {Date}
   */
  advanceToWorkingDay(startDate, workingDaysSet) {
    const d = new Date(startDate);
    while (!workingDaysSet.has(d.getUTCDay() === 0 ? 7 : d.getUTCDay())) {
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return d;
  }

  /**
   * Advances a reference date to the strictly next working day (at least +1 calendar day).
   * @param {Date} startDate
   * @param {Set<number>} workingDaysSet
   * @returns {Date}
   */
  advanceToNextWorkingDay(startDate, workingDaysSet) {
    const d = new Date(startDate);
    do {
      d.setUTCDate(d.getUTCDate() + 1);
    } while (!workingDaysSet.has(d.getUTCDay() === 0 ? 7 : d.getUTCDay()));
    return d;
  }

  /**
   * Adds business days (skipping Saturday and Sunday by default or using custom workingDays).
   * @param {Date} startDate
   * @param {number} daysToAdd
   * @param {Array<number>} [workingDays=[1,2,3,4,5]]
   * @returns {Date}
   */
  addBusinessDays(startDate, daysToAdd, workingDays = [1, 2, 3, 4, 5]) {
    const workingSet = new Set(workingDays);
    return this.addWorkingDays(startDate, daysToAdd, workingSet);
  }

  /**
   * Adds calendar days to a given starting date.
   * @param {Date} startDate
   * @param {number} daysToAdd
   * @returns {Date}
   */
  addCalendarDays(startDate, daysToAdd) {
    const d = new Date(startDate);
    d.setUTCDate(d.getUTCDate() + Math.max(0, parseInt(daysToAdd, 10) || 0));
    return d;
  }

  /**
   * Calculates dispatch date and delivery window promise strictly governed by configuration.
   * @param {Object} params
   * @param {Date|string} [params.orderDate=new Date()]
   * @param {Date|string} [params.orderPlacedAt]
   * @param {Object} [params.shippingRule]
   * @param {Object} [params.originLocation]
   * @param {string} [params.originTimeZone]
   * @param {string} [params.timezone]
   * @param {string} [params.processingCutoffLocal]
   * @param {string} [params.cutoffTime]
   * @param {Array<number>} [params.workingDays]
   * @param {number} [params.processingMinBusinessDays]
   * @param {number} [params.processingMaxBusinessDays]
   * @param {number} [params.deliveryMinDays]
   * @param {number} [params.deliveryMaxDays]
   * @param {boolean} [params.isRemote=false]
   * @param {number} [params.remoteDeliveryMinDays=null]
   * @param {number} [params.remoteDeliveryMaxDays=null]
   * @returns {Object} Governed delivery promise snapshot
   */
  calculatePromise({
    orderDate = new Date(),
    orderPlacedAt = null,
    shippingRule = null,
    originLocation = null,
    originTimeZone = null,
    timezone = null,
    processingCutoffLocal = null,
    cutoffTime = null,
    workingDays = null,
    processingMinBusinessDays = null,
    processingMaxBusinessDays = null,
    deliveryMinDays = null,
    deliveryMaxDays = null,
    isRemote = false,
    remoteDeliveryMinDays = null,
    remoteDeliveryMaxDays = null
  } = {}) {
    const rawDate = orderPlacedAt || orderDate;
    const baseDate = new Date(rawDate);
    if (Number.isNaN(baseDate.getTime())) {
      throw new AppError('Invalid order date timestamp', 400, 'INVALID_ORDER_DATE');
    }

    // 1. Resolve & Validate Timezone
    const resolvedTimeZone = (
      originLocation?.timeZone
      || originTimeZone
      || timezone
      || shippingRule?.timeZone
      || ''
    ).trim();

    if (!this.isValidTimeZone(resolvedTimeZone)) {
      throw new AppError(
        `Invalid or missing origin timezone: '${resolvedTimeZone}'`,
        400,
        'INVALID_ORIGIN_TIMEZONE'
      );
    }

    // 2. Resolve & Validate Cutoff Time (HH:mm)
    const rawCutoff = shippingRule?.processingCutoffLocal || processingCutoffLocal || cutoffTime;
    const resolvedCutoff = String(rawCutoff || '').trim();
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(resolvedCutoff)) {
      throw new AppError(
        `Invalid processing cutoff time format: '${resolvedCutoff}'. Must be HH:mm 24-hour format (00:00 - 23:59)`,
        400,
        'INVALID_PROCESSING_CUTOFF'
      );
    }

    const [cutoffHours, cutoffMinutes] = resolvedCutoff.split(':').map((n) => parseInt(n, 10));
    const cutoffTotalMinutes = cutoffHours * 60 + cutoffMinutes;

    // 3. Resolve & Validate Working Days ([1..7])
    const rawWorkingDays = shippingRule?.workingDays || workingDays;
    if (
      !Array.isArray(rawWorkingDays)
      || rawWorkingDays.length === 0
      || rawWorkingDays.length > 7
      || !rawWorkingDays.every((d) => Number.isInteger(d) && d >= 1 && d <= 7)
      || new Set(rawWorkingDays).size !== rawWorkingDays.length
    ) {
      throw new AppError(
        'Invalid or missing workingDays. Must be a non-empty array of unique integers (1=Monday ... 7=Sunday)',
        400,
        'INVALID_WORKING_DAYS'
      );
    }

    const resolvedWorkingDays = [...rawWorkingDays].sort((a, b) => a - b);
    const workingDaysSet = new Set(resolvedWorkingDays);

    // 4. Resolve & Validate Processing Business Days Envelopes
    const rawMinProc = shippingRule?.processingMinBusinessDays ?? processingMinBusinessDays ?? 0;
    const rawMaxProc = shippingRule?.processingMaxBusinessDays ?? processingMaxBusinessDays ?? 1;
    const minProc = Number(rawMinProc);
    const maxProc = Number(rawMaxProc);

    if (Number.isNaN(minProc) || Number.isNaN(maxProc) || minProc < 0 || maxProc < minProc) {
      throw new AppError(
        `Invalid processing business days range: min=${minProc}, max=${maxProc}`,
        400,
        'INVALID_PROCESSING_DAYS'
      );
    }

    // 5. Resolve & Validate Transit Days Envelopes
    const rawMinDelivery = isRemote && (shippingRule?.remoteDeliveryMinDays != null || remoteDeliveryMinDays != null)
      ? (shippingRule?.remoteDeliveryMinDays ?? remoteDeliveryMinDays)
      : (shippingRule?.deliveryMinDays ?? deliveryMinDays ?? 2);

    const rawMaxDelivery = isRemote && (shippingRule?.remoteDeliveryMaxDays != null || remoteDeliveryMaxDays != null)
      ? (shippingRule?.remoteDeliveryMaxDays ?? remoteDeliveryMaxDays)
      : (shippingRule?.deliveryMaxDays ?? deliveryMaxDays ?? 5);

    const minTransit = Number(rawMinDelivery);
    const maxTransit = Number(rawMaxDelivery);

    if (Number.isNaN(minTransit) || Number.isNaN(maxTransit) || minTransit < 0 || maxTransit < minTransit) {
      throw new AppError(
        `Invalid delivery transit days range: min=${minTransit}, max=${maxTransit}`,
        400,
        'INVALID_DELIVERY_DAYS'
      );
    }

    // 6. Convert UTC timestamp to local calendar date & time in origin timezone
    const zonedParts = this.getZonedParts(baseDate, resolvedTimeZone);
    const orderTotalMinutes = zonedParts.hour * 60 + zonedParts.minute;

    const isPlacementOnWorkingDay = workingDaysSet.has(zonedParts.isoDay);
    const isPastCutoff = orderTotalMinutes >= cutoffTotalMinutes;

    // 7. Determine initial processing start day (midday UTC reference)
    let processingStartDay;
    if (!isPlacementOnWorkingDay) {
      // Order placed on non-working day: advances to next governed working day
      processingStartDay = this.advanceToWorkingDay(zonedParts.utcMiddayDate, workingDaysSet);
    } else if (isPastCutoff) {
      // Order placed on working day at or after cutoff: advances to next governed working day
      processingStartDay = this.advanceToNextWorkingDay(zonedParts.utcMiddayDate, workingDaysSet);
    } else {
      // Order placed on working day before cutoff: processing starts today
      processingStartDay = zonedParts.utcMiddayDate;
    }

    // 8. Apply processing business days to determine dispatch envelope
    const dispatchMinDate = this.addWorkingDays(processingStartDay, minProc, workingDaysSet);
    const dispatchMaxDate = this.addWorkingDays(processingStartDay, maxProc, workingDaysSet);

    // 9. Apply transit days to determine delivery envelope
    const minDeliveryDate = this.addWorkingDays(dispatchMinDate, minTransit, workingDaysSet);
    const maxDeliveryDate = this.addWorkingDays(dispatchMaxDate, maxTransit, workingDaysSet);

    const isSameDayDispatch = !isPastCutoff
      && isPlacementOnWorkingDay
      && minProc === 0
      && dispatchMinDate.toISOString().slice(0, 10) === zonedParts.dateString;

    return {
      orderDate: baseDate.toISOString(),
      originTimeZone: resolvedTimeZone,
      processingCutoffLocal: resolvedCutoff,
      workingDays: resolvedWorkingDays,
      processingMinBusinessDays: minProc,
      processingMaxBusinessDays: maxProc,
      deliveryMinDays: minTransit,
      deliveryMaxDays: maxTransit,
      dispatchMinDate: dispatchMinDate.toISOString(),
      dispatchMaxDate: dispatchMaxDate.toISOString(),
      minDeliveryDate: minDeliveryDate.toISOString(),
      maxDeliveryDate: maxDeliveryDate.toISOString(),
      deliveryWindow: {
        minDays: minTransit,
        maxDays: maxTransit,
        minDeliveryDate: minDeliveryDate.toISOString(),
        maxDeliveryDate: maxDeliveryDate.toISOString(),
        promiseText: `${minTransit}-${maxTransit} business days`
      },
      // Backward compatibility fields
      dispatchDate: dispatchMinDate.toISOString(),
      minDays: minTransit,
      maxDays: maxTransit,
      isSameDayDispatch,
      isPastCutoff,
      isRemote: Boolean(isRemote),
      promiseText: `${minTransit}-${maxTransit} business days`
    };
  }
}

module.exports = DeliveryPromiseService;
module.exports.DeliveryPromiseService = DeliveryPromiseService;
