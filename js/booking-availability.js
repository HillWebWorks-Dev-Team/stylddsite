(function initBookingAvailability(global) {
  var DEFAULT_LEAD_MINUTES = 4320;

  function overlaps(aStart, aEnd, bStart, bEnd) {
    return aStart.toMillis() < bEnd.toMillis() && bStart.toMillis() < aEnd.toMillis();
  }

  function createEngine(cfg, DateTime) {
    cfg = cfg && typeof cfg === 'object' ? cfg : {};
    var hours = cfg.bookingHours || cfg.hours || {};
    var zone =
      cfg.salonTimeZone ||
      cfg.timezone ||
      (cfg.content && cfg.content.timezone) ||
      'America/New_York';

    function nowInZone() {
      return DateTime.now().setZone(zone);
    }

    function weekdayIndex(day) {
      return day.weekday % 7;
    }

    function advanceLeadMinutes() {
      if (hours.sameDayLeadMinutes != null && Number.isFinite(Number(hours.sameDayLeadMinutes))) {
        return Number(hours.sameDayLeadMinutes);
      }
      if (hours.hoursInAdvance != null && Number.isFinite(Number(hours.hoursInAdvance))) {
        return Number(hours.hoursInAdvance) * 60;
      }
      return DEFAULT_LEAD_MINUTES;
    }

    function earliestBookableTime() {
      return nowInZone().plus({ minutes: advanceLeadMinutes() });
    }

    function isWeekdayClosed(weekday) {
      if (hours.days && typeof hours.days === 'object') {
        var dayCfg = hours.days[String(weekday)] || hours.days[weekday];
        return !dayCfg || dayCfg.closed;
      }
      return (hours.closedWeekdays || []).indexOf(weekday) !== -1;
    }

    function parseSlotLabel(dateIso, label) {
      var patterns = ['h:mm a', 'h:mma', 'ha', 'H:mm'];
      for (var i = 0; i < patterns.length; i++) {
        var dt = DateTime.fromFormat(dateIso + ' ' + String(label).trim(), 'yyyy-MM-dd ' + patterns[i], {
          zone: zone,
        });
        if (dt.isValid) return dt;
      }
      return null;
    }

    function getDayCloseTime(day) {
      var weekday = weekdayIndex(day);

      if (hours.days && typeof hours.days === 'object') {
        var dayCfg = hours.days[String(weekday)] || hours.days[weekday];
        if (dayCfg && dayCfg.close) {
          var closeLabel = String(dayCfg.close).trim();
          var patterns = ['H:mm', 'h:mm a', 'h:mma'];
          for (var i = 0; i < patterns.length; i++) {
            var parsed = DateTime.fromFormat(day.toISODate() + ' ' + closeLabel, 'yyyy-MM-dd ' + patterns[i], {
              zone: zone,
            });
            if (parsed.isValid) return parsed;
          }
        }
      }

      return day.set({
        hour: hours.slotDayEndHour != null ? hours.slotDayEndHour : 19,
        minute: hours.slotDayEndMinute != null ? hours.slotDayEndMinute : 30,
        second: 0,
        millisecond: 0,
      });
    }

    function latestAllowedStart(day, durationMinutes) {
      var close = getDayCloseTime(day);
      var latest = close.minus({ minutes: durationMinutes });
      var weekday = weekdayIndex(day);

      if (weekday === 6 && hours.saturdayLastStartHour != null) {
        var saturdayLast = day.set({
          hour: hours.saturdayLastStartHour,
          minute: hours.saturdayLastStartMinute || 0,
          second: 0,
          millisecond: 0,
        });
        if (saturdayLast < latest) latest = saturdayLast;
      }

      return latest;
    }

    function fitsWithinBusinessHours(slotStart, durationMinutes) {
      var slotEnd = slotStart.plus({ minutes: durationMinutes });
      var close = getDayCloseTime(slotStart);
      if (slotEnd > close) return false;
      if (slotStart > latestAllowedStart(slotStart, durationMinutes)) return false;
      return true;
    }

    function generateSlotTimes(dateIso) {
      var day = DateTime.fromISO(dateIso, { zone: zone });
      if (!day.isValid) return [];

      var weekday = weekdayIndex(day);
      if (isWeekdayClosed(weekday)) return [];

      if (hours.days && typeof hours.days === 'object') {
        var dayCfg = hours.days[String(weekday)] || hours.days[weekday];
        return (dayCfg.slots || [])
          .map(function (label) {
            return parseSlotLabel(dateIso, label);
          })
          .filter(Boolean);
      }

      var start = day.set({
        hour: hours.slotDayStartHour != null ? hours.slotDayStartHour : 8,
        minute: hours.slotDayStartMinute || 0,
        second: 0,
        millisecond: 0,
      });
      var endLimit = day.set({
        hour: hours.slotDayEndHour != null ? hours.slotDayEndHour : 19,
        minute: hours.slotDayEndMinute != null ? hours.slotDayEndMinute : 30,
        second: 0,
        millisecond: 0,
      });

      if (weekday === 6 && hours.saturdayLastStartHour != null) {
        endLimit = day.set({
          hour: hours.saturdayLastStartHour,
          minute: hours.saturdayLastStartMinute || 0,
          second: 0,
          millisecond: 0,
        });
      }

      var step = hours.slotStepMinutes || 30;
      var slots = [];
      var cursor = start;
      while (cursor <= endLimit) {
        slots.push(cursor);
        cursor = cursor.plus({ minutes: step });
      }
      return slots;
    }

    function bookableSlotTimes(dateIso) {
      var earliest = earliestBookableTime();
      return generateSlotTimes(dateIso).filter(function (slotStart) {
        return slotStart >= earliest;
      });
    }

    function calendarDayDisabledReason(day) {
      if (!day || !day.isValid) return 'closed';

      var today = nowInZone().startOf('day');
      if (day < today) return 'past';

      var weekday = weekdayIndex(day);
      if (isWeekdayClosed(weekday)) return 'closed';

      var slots = generateSlotTimes(day.toISODate());
      if (!slots.length) return 'closed';

      if (!bookableSlotTimes(day.toISODate()).length) return 'advance';

      return null;
    }

    function parseUnavailableInterval(item) {
      if (!item) return null;

      var start = DateTime.fromISO(item.start, { zone: zone });
      if (!start.isValid) return null;

      var end = item.end
        ? DateTime.fromISO(String(item.end).replace(' ', 'T'), { zone: zone })
        : start.plus({ minutes: item.duration || 60 });
      if (!end.isValid) return null;

      return {
        start: start,
        end: end,
        kind: item.kind || 'booking',
      };
    }

    function isSlotBookable(slotStart, durationMinutes, unavailable) {
      if (!fitsWithinBusinessHours(slotStart, durationMinutes)) {
        return false;
      }

      var slotEnd = slotStart.plus({ minutes: durationMinutes });
      var capacity = hours.concurrentAppointmentCapacity || 1;
      var bookingOverlaps = 0;
      var list = unavailable || [];

      for (var i = 0; i < list.length; i++) {
        var interval = parseUnavailableInterval(list[i]);
        if (!interval) continue;
        if (!overlaps(slotStart, slotEnd, interval.start, interval.end)) continue;

        if (interval.kind === 'block') {
          return false;
        }
        bookingOverlaps += 1;
      }

      return bookingOverlaps < capacity;
    }

    function classifySlot(slotStart, durationMinutes, unavailable) {
      return isSlotBookable(slotStart, durationMinutes, unavailable) ? 'open' : 'full';
    }

    return {
      zone: zone,
      hours: hours,
      advanceLeadMinutes: advanceLeadMinutes,
      earliestBookableTime: earliestBookableTime,
      isWeekdayClosed: isWeekdayClosed,
      generateSlotTimes: generateSlotTimes,
      bookableSlotTimes: bookableSlotTimes,
      calendarDayDisabledReason: calendarDayDisabledReason,
      isSlotBookable: isSlotBookable,
      classifySlot: classifySlot,
      fitsWithinBusinessHours: fitsWithinBusinessHours,
      parseUnavailableInterval: parseUnavailableInterval,
    };
  }

  global.BookingAvailability = {
    createEngine: createEngine,
  };
})(window);
