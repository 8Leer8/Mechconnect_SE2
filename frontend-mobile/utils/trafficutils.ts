// utils/trafficUtils.ts
// Time-based traffic estimator for Philippines
// Used BEFORE mechanic accepts (no API needed)
// TomTom is used AFTER mechanic accepts (real traffic)

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

export type TrafficLevel = 'light' | 'moderate' | 'heavy' | 'severe';

export interface TrafficEstimate {
  level: TrafficLevel;
  label: string;          // display text
  emoji: string;          // traffic color emoji
  surchargePercent: number; // as decimal e.g. 0.20 = 20%
  surchargeLabel: string; // e.g. "+20%"
  timeNote: string;       // explanation for user
  color: string;          // hex color for UI
}

export interface FeeBreakdown {
  baseFee: number;
  distanceKm: number;
  distanceFee: number;
  surchargeAmount: number;
  totalFee: number;
  minFee: number;         // best case (light traffic)
  maxFee: number;         // worst case (severe traffic)
  traffic: TrafficEstimate;
  isEstimate: boolean;    // always true at broadcast time
}

// ─────────────────────────────────────────────
// PHILIPPINE TRAFFIC SCHEDULE
// Based on typical Metro + Provincial PH traffic patterns
// ─────────────────────────────────────────────

export const getTimeBasedTraffic = (date?: Date): TrafficEstimate => {
  // Use provided date or current time
  // Gets hour in LOCAL time (Philippine Time = UTC+8)
  const now = date || new Date();
  const hour = now.getHours(); // 0 to 23
  const day = now.getDay();    // 0 = Sunday, 6 = Saturday

  const isWeekend = day === 0 || day === 6;

  // ── WEEKENDS ──────────────────────────────
  // Traffic is lighter on weekends in PH
  if (isWeekend) {
    if (hour >= 0 && hour < 7) {
      // Late night / Early morning weekend
      return {
        level: 'light',
        label: 'Light Traffic',
        emoji: '🟢',
        surchargePercent: 0.00,
        surchargeLabel: '+0%',
        timeNote: 'Late night / Early morning (Weekend)',
        color: '#34C759',
      };
    } else if (hour >= 7 && hour < 10) {
      // Weekend morning — malls opening, people going out
      return {
        level: 'moderate',
        label: 'Moderate Traffic',
        emoji: '🟡',
        surchargePercent: 0.10,
        surchargeLabel: '+10%',
        timeNote: 'Weekend morning — moderate activity',
        color: '#FFD60A',
      };
    } else if (hour >= 10 && hour < 20) {
      // Weekend daytime — malls, events, leisure
      return {
        level: 'moderate',
        label: 'Moderate Traffic',
        emoji: '🟡',
        surchargePercent: 0.10,
        surchargeLabel: '+10%',
        timeNote: 'Weekend daytime — malls and leisure',
        color: '#FFD60A',
      };
    } else {
      // Weekend night
      return {
        level: 'light',
        label: 'Light Traffic',
        emoji: '🟢',
        surchargePercent: 0.00,
        surchargeLabel: '+0%',
        timeNote: 'Weekend evening — winding down',
        color: '#34C759',
      };
    }
  }

  // ── WEEKDAYS ──────────────────────────────

  if (hour >= 0 && hour < 5) {
    // 12AM – 5AM: Midnight / Late night
    return {
      level: 'light',
      label: 'Light Traffic',
      emoji: '🟢',
      surchargePercent: 0.00,
      surchargeLabel: '+0%',
      timeNote: 'Late night — very low traffic',
      color: '#34C759',
    };
  }

  else if (hour >= 5 && hour < 7) {
    // 5AM – 7AM: Early morning commute starting
    return {
      level: 'moderate',
      label: 'Moderate Traffic',
      emoji: '🟡',
      surchargePercent: 0.10,
      surchargeLabel: '+10%',
      timeNote: 'Early morning — traffic building up',
      color: '#FFD60A',
    };
  }

  else if (hour >= 7 && hour < 10) {
    // 7AM – 10AM: Morning rush hour 🔴
    // Worst traffic in PH: school + office rush
    return {
      level: 'severe',
      label: 'Rush Hour',
      emoji: '🔴',
      surchargePercent: 0.30,
      surchargeLabel: '+30%',
      timeNote: 'Morning rush hour (7AM–10AM) — peak traffic',
      color: '#FF3B30',
    };
  }

  else if (hour >= 10 && hour < 12) {
    // 10AM – 12PM: Mid-morning, traffic easing
    return {
      level: 'moderate',
      label: 'Moderate Traffic',
      emoji: '🟡',
      surchargePercent: 0.10,
      surchargeLabel: '+10%',
      timeNote: 'Mid-morning — moderate traffic',
      color: '#FFD60A',
    };
  }

  else if (hour >= 12 && hour < 14) {
    // 12PM – 2PM: Lunch hour — moderate spike
    return {
      level: 'moderate',
      label: 'Lunch Hour',
      emoji: '🟡',
      surchargePercent: 0.10,
      surchargeLabel: '+10%',
      timeNote: 'Lunch hour — moderate traffic spike',
      color: '#FFD60A',
    };
  }

  else if (hour >= 14 && hour < 16) {
    // 2PM – 4PM: Afternoon lull — lightest of the day
    return {
      level: 'light',
      label: 'Light Traffic',
      emoji: '🟢',
      surchargePercent: 0.00,
      surchargeLabel: '+0%',
      timeNote: 'Afternoon lull — best time to travel',
      color: '#34C759',
    };
  }

  else if (hour >= 16 && hour < 17) {
    // 4PM – 5PM: Traffic starting to build again
    return {
      level: 'moderate',
      label: 'Moderate Traffic',
      emoji: '🟡',
      surchargePercent: 0.10,
      surchargeLabel: '+10%',
      timeNote: 'Pre-rush — traffic building up',
      color: '#FFD60A',
    };
  }

  else if (hour >= 17 && hour < 21) {
    // 5PM – 9PM: Evening rush hour 🔴
    // Worst traffic in PH: office dismissal + dinner rush
    return {
      level: 'severe',
      label: 'Rush Hour',
      emoji: '🔴',
      surchargePercent: 0.30,
      surchargeLabel: '+30%',
      timeNote: 'Evening rush hour (5PM–9PM) — peak traffic',
      color: '#FF3B30',
    };
  }

  else if (hour >= 21 && hour < 23) {
    // 9PM – 11PM: Night, traffic easing
    return {
      level: 'moderate',
      label: 'Moderate Traffic',
      emoji: '🟡',
      surchargePercent: 0.10,
      surchargeLabel: '+10%',
      timeNote: 'Night time — traffic easing',
      color: '#FFD60A',
    };
  }

  else {
    // 11PM – 12AM: Late night
    return {
      level: 'light',
      label: 'Light Traffic',
      emoji: '🟢',
      surchargePercent: 0.00,
      surchargeLabel: '+0%',
      timeNote: 'Late night — light traffic',
      color: '#34C759',
    };
  }
};

// ─────────────────────────────────────────────
// FEE CALCULATOR
// Used at broadcast time (time-based traffic)
// ─────────────────────────────────────────────

const BASE_FEE = 50;       // Fixed base ₱50
const RATE_PER_KM = 15;    // ₱15 per km

export const calculateBroadcastFee = (distanceKm: number): FeeBreakdown => {
  const traffic = getTimeBasedTraffic();

  const distanceFee     = distanceKm * RATE_PER_KM;
  const surchargeAmount = distanceFee * traffic.surchargePercent;
  const totalFee        = BASE_FEE + distanceFee + surchargeAmount;

  // Range: best case (light) to worst case (severe)
  const minFee = BASE_FEE + distanceFee;                        // 0% surcharge
  const maxFee = BASE_FEE + distanceFee + (distanceFee * 0.30); // 30% surcharge

  return {
    baseFee:         BASE_FEE,
    distanceKm:      parseFloat(distanceKm.toFixed(2)),
    distanceFee:     parseFloat(distanceFee.toFixed(2)),
    surchargeAmount: parseFloat(surchargeAmount.toFixed(2)),
    totalFee:        parseFloat(totalFee.toFixed(2)),
    minFee:          parseFloat(minFee.toFixed(2)),
    maxFee:          parseFloat(maxFee.toFixed(2)),
    traffic,
    isEstimate:      true,
  };
};

// ─────────────────────────────────────────────
// REAL FEE CALCULATOR
// Used AFTER mechanic accepts (ORS + TomTom real data)
// ─────────────────────────────────────────────

export const calculateRealFee = (
  distanceKm: number,
  freeFlowSpeed: number,   // from TomTom
  currentSpeed: number     // from TomTom
): FeeBreakdown => {

  // Calculate real traffic ratio from TomTom data
  const ratio = freeFlowSpeed / currentSpeed;

  let traffic: TrafficEstimate;

  if (ratio < 1.2) {
    traffic = {
      level: 'light',
      label: 'Light Traffic',
      emoji: '🟢',
      surchargePercent: 0.00,
      surchargeLabel: '+0%',
      timeNote: `Moving at ${currentSpeed} km/h`,
      color: '#34C759',
    };
  } else if (ratio < 1.5) {
    traffic = {
      level: 'moderate',
      label: 'Moderate Traffic',
      emoji: '🟡',
      surchargePercent: 0.10,
      surchargeLabel: '+10%',
      timeNote: `Slowed to ${currentSpeed} km/h (normal: ${freeFlowSpeed} km/h)`,
      color: '#FFD60A',
    };
  } else if (ratio < 2.0) {
    traffic = {
      level: 'heavy',
      label: 'Heavy Traffic',
      emoji: '🟠',
      surchargePercent: 0.20,
      surchargeLabel: '+20%',
      timeNote: `Slowed to ${currentSpeed} km/h (normal: ${freeFlowSpeed} km/h)`,
      color: '#FF9500',
    };
  } else {
    traffic = {
      level: 'severe',
      label: 'Severe Traffic',
      emoji: '🔴',
      surchargePercent: 0.30,
      surchargeLabel: '+30%',
      timeNote: `Very slow — ${currentSpeed} km/h (normal: ${freeFlowSpeed} km/h)`,
      color: '#FF3B30',
    };
  }

  const distanceFee     = distanceKm * RATE_PER_KM;
  const surchargeAmount = distanceFee * traffic.surchargePercent;
  const totalFee        = BASE_FEE + distanceFee + surchargeAmount;
  const minFee          = BASE_FEE + distanceFee;
  const maxFee          = BASE_FEE + distanceFee + (distanceFee * 0.30);

  return {
    baseFee:         BASE_FEE,
    distanceKm:      parseFloat(distanceKm.toFixed(2)),
    distanceFee:     parseFloat(distanceFee.toFixed(2)),
    surchargeAmount: parseFloat(surchargeAmount.toFixed(2)),
    totalFee:        parseFloat(totalFee.toFixed(2)),
    minFee:          parseFloat(minFee.toFixed(2)),
    maxFee:          parseFloat(maxFee.toFixed(2)),
    traffic,
    isEstimate:      false, // real data now!
  };
};

// ─────────────────────────────────────────────
// HELPER: get current traffic schedule
// Useful for showing the full day schedule to user
// ─────────────────────────────────────────────

export const getTrafficSchedule = () => [
  { time: '12AM – 5AM',  level: 'Light 🟢',    surcharge: '+0%',  note: 'Late night' },
  { time: '5AM – 7AM',   level: 'Moderate 🟡', surcharge: '+10%', note: 'Early morning' },
  { time: '7AM – 10AM',  level: 'Rush Hour 🔴', surcharge: '+30%', note: 'Morning peak' },
  { time: '10AM – 12PM', level: 'Moderate 🟡', surcharge: '+10%', note: 'Mid-morning' },
  { time: '12PM – 2PM',  level: 'Moderate 🟡', surcharge: '+10%', note: 'Lunch hour' },
  { time: '2PM – 4PM',   level: 'Light 🟢',    surcharge: '+0%',  note: 'Afternoon lull' },
  { time: '4PM – 5PM',   level: 'Moderate 🟡', surcharge: '+10%', note: 'Pre-rush' },
  { time: '5PM – 9PM',   level: 'Rush Hour 🔴', surcharge: '+30%', note: 'Evening peak' },
  { time: '9PM – 11PM',  level: 'Moderate 🟡', surcharge: '+10%', note: 'Night' },
  { time: '11PM – 12AM', level: 'Light 🟢',    surcharge: '+0%',  note: 'Late night' },
];