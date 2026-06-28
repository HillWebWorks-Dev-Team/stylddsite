/** Business hours model for Web Studio calendar (port of bookingHours.ts). */

export const DEFAULT_BOOKING_HOURS = {
  slotDayStartHour: 8,
  slotDayStartMinute: 0,
  slotDayEndHour: 19,
  slotDayEndMinute: 30,
  slotStepMinutes: 30,
  closedWeekdays: [],
  sameDayLeadMinutes: 4320,
  saturdayLastStartHour: 14,
  saturdayLastStartMinute: 0,
  concurrentAppointmentCapacity: 1,
  weekdayHours: {},
};

function normalizeWeekdayHours(raw) {
  const source = (raw && raw.weekdayHours) || {};
  const normalized = {};
  Object.keys(source).forEach(function (key) {
    const entry = source[key];
    if (!entry || typeof entry !== 'object') return;
    normalized[String(key)] = {
      startHour: entry.startHour != null ? Number(entry.startHour) : null,
      startMinute: entry.startMinute != null ? Number(entry.startMinute) : 0,
      endHour: entry.endHour != null ? Number(entry.endHour) : null,
      endMinute: entry.endMinute != null ? Number(entry.endMinute) : 0,
    };
  });
  return normalized;
}

export function normalizeBookingHours(raw) {
  const defaults = DEFAULT_BOOKING_HOURS;
  raw = raw && typeof raw === 'object' ? raw : {};

  if (raw.days && typeof raw.days === 'object') {
    let legacyLead = defaults.sameDayLeadMinutes;
    if (raw.sameDayLeadMinutes != null) legacyLead = Number(raw.sameDayLeadMinutes);
    else if (raw.hoursInAdvance != null) legacyLead = Number(raw.hoursInAdvance) * 60;

    return Object.assign({}, defaults, {
      days: raw.days,
      sameDayLeadMinutes: Number.isFinite(legacyLead) ? legacyLead : defaults.sameDayLeadMinutes,
      hoursInAdvance: raw.hoursInAdvance,
      weekdayHours: normalizeWeekdayHours(raw),
      concurrentAppointmentCapacity:
        raw.concurrentAppointmentCapacity != null
          ? Number(raw.concurrentAppointmentCapacity)
          : defaults.concurrentAppointmentCapacity,
    });
  }

  return {
    slotDayStartHour: raw.slotDayStartHour != null ? Number(raw.slotDayStartHour) : defaults.slotDayStartHour,
    slotDayStartMinute:
      raw.slotDayStartMinute != null ? Number(raw.slotDayStartMinute) : defaults.slotDayStartMinute,
    slotDayEndHour: raw.slotDayEndHour != null ? Number(raw.slotDayEndHour) : defaults.slotDayEndHour,
    slotDayEndMinute: raw.slotDayEndMinute != null ? Number(raw.slotDayEndMinute) : defaults.slotDayEndMinute,
    slotStepMinutes: raw.slotStepMinutes != null ? Number(raw.slotStepMinutes) : defaults.slotStepMinutes,
    closedWeekdays: Array.isArray(raw.closedWeekdays)
      ? raw.closedWeekdays.map(Number)
      : defaults.closedWeekdays.slice(),
    weekdayHours: normalizeWeekdayHours(raw),
    sameDayLeadMinutes:
      raw.sameDayLeadMinutes != null ? Number(raw.sameDayLeadMinutes) : defaults.sameDayLeadMinutes,
    saturdayLastStartHour:
      raw.saturdayLastStartHour != null ? Number(raw.saturdayLastStartHour) : defaults.saturdayLastStartHour,
    saturdayLastStartMinute:
      raw.saturdayLastStartMinute != null
        ? Number(raw.saturdayLastStartMinute)
        : defaults.saturdayLastStartMinute,
    concurrentAppointmentCapacity:
      raw.concurrentAppointmentCapacity != null
        ? Number(raw.concurrentAppointmentCapacity)
        : defaults.concurrentAppointmentCapacity,
  };
}
