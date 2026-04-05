import { GameSlotConfig } from "@/lib/services/game-service";

export type Submission = any;

export interface CalculationResult {
  results: any;
  eliminatedPlayerIds: string[];
}

export function calculateA1(submissions: Submission[], config: GameSlotConfig): CalculationResult {
  if (submissions.length === 0) return { results: { average: 0, target: 0, playerStats: {} }, eliminatedPlayerIds: [] };
  
  const sum = submissions.reduce((acc, curr) => acc + Number(curr.value || 0), 0);
  const average = sum / submissions.length;
  
  // Make multiplier configurable (default to 2/3)
  const multiplier = config.config.gameSpecificConfig?.multiplier ?? (2/3);
  const target = average * multiplier;

  submissions.forEach(sub => {
    sub.distance = Math.abs(Number(sub.value || 0) - target);
  });

  // Sort by distance ascending (closest is rank 1)
  const sortedAsc = [...submissions].sort((a, b) => a.distance - b.distance);
  
  const playerStats: Record<string, any> = {};
  sortedAsc.forEach((sub, idx) => {
     playerStats[sub.playerId] = {
        distance: sub.distance,
        rank: idx + 1
     };
  });

  // Sort by distance descending for elimination
  const sortedDesc = [...submissions].sort((a, b) => b.distance - a.distance);
  
  const elimCount = config.config.eliminationValue || 1;
  const eliminatedPlayerIds = sortedDesc.slice(0, elimCount).map(s => s.playerId);

  return {
    results: { average, target, playerStats },
    eliminatedPlayerIds
  };
}

export function calculateA2(submissions: Submission[], config: GameSlotConfig): CalculationResult {
  // value is range e.g. "1-10", "11-20"
  const counts: Record<string, number> = {};
  
  // Initialize all ranges so missing ones are 0, this prevents them disappearing
  const rangesList = ["1-10", "11-20", "21-30", "31-40", "41-50", "51-60", "61-70", "71-80", "81-90", "91-100"];
  rangesList.forEach(r => counts[r] = 0);

  submissions.forEach(s => {
    if (s.value) counts[s.value] = (counts[s.value] || 0) + 1;
  });

  const sortedRangesRaw = Object.entries(counts).sort((a, b) => a[1] - b[1]); // fewest to most
  const sortedRanges = sortedRangesRaw.map(([range, count]) => ({ range, count }));
  
  if (submissions.length === 0) return { results: { majorityRange: null, minorityRange: null, sortedRanges: [], totalPlayers: 0 }, eliminatedPlayerIds: [] };
  
  const minorityRange = sortedRangesRaw[0][0];
  const majorityRange = sortedRangesRaw[sortedRangesRaw.length - 1][0];
  
  const eliminatedPlayerIds = submissions.filter(s => s.value === majorityRange).map(s => s.playerId);

  return {
    results: { minorityRange, majorityRange, counts, sortedRanges, totalPlayers: submissions.length },
    eliminatedPlayerIds
  };
}

export function calculateA3(submissions: Submission[], config: GameSlotConfig): CalculationResult {
  if (submissions.length === 0) return { results: { pairs: [], playerStats: {} }, eliminatedPlayerIds: [] };
  
  const penalty = config.config.gameSpecificConfig?.penalty || 5;
  const bonus = config.config.gameSpecificConfig?.bonus || 5;
  
  // Fisher-Yates shuffle for deterministic fair pairing
  const shuffled = [...submissions];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  
  const pairs: any[] = [];
  const playerStats: Record<string, any> = {};
  
  // Find median value for odd player treatment
  const allValues = submissions.map(s => Number(s.value || 0)).sort((a, b) => a - b);
  const medianValue = allValues.length % 2 === 0
    ? (allValues[allValues.length / 2 - 1] + allValues[allValues.length / 2]) / 2
    : allValues[Math.floor(allValues.length / 2)];
  
  for (let i = 0; i < shuffled.length; i += 2) {
    const p1 = shuffled[i];
    const p2 = shuffled[i + 1];
    
    if (p2) {
      const v1 = Number(p1.value || 0);
      const v2 = Number(p2.value || 0);
      
      let score1 = 0;
      let score2 = 0;
      let p1Bonus = 0;
      let p2Bonus = 0;
      
      if (v1 === v2) {
         score1 = v1;
         score2 = v2;
      } else if (v1 < v2) {
         score1 = v1 + bonus;
         score2 = v1 - penalty;
         p1Bonus = bonus;
         p2Bonus = -penalty;
      } else {
         score1 = v2 - penalty;
         score2 = v2 + bonus;
         p1Bonus = -penalty;
         p2Bonus = bonus;
      }
      
      pairs.push({
         player1Id: p1.playerId, player1Uid: p1.id, val1: v1, score1, p1Bonus,
         player2Id: p2.playerId, player2Uid: p2.id, val2: v2, score2, p2Bonus
      });
      
      playerStats[p1.playerId] = { opponentVal: v2, myScore: score1, myBonus: p1Bonus };
      playerStats[p2.playerId] = { opponentVal: v1, myScore: score2, myBonus: p2Bonus };
    } else {
       // Odd player out — paired with "ghost" at median value
       // This is fair: their score is the median, no bonus/penalty
       const v1 = Number(p1.value || 0);
       pairs.push({
         player1Id: p1.playerId, player1Uid: p1.id, val1: v1, score1: v1, p1Bonus: 0,
         player2Id: null, player2Uid: null, val2: null, score2: 0, p2Bonus: 0,
         isGhostPair: true,
       });
       playerStats[p1.playerId] = {
         opponentVal: null,
         myScore: v1,
         myBonus: 0,
         isGhostPair: true,
         note: "Ghost pair — no bonus/penalty applied",
       };
    }
  }

  // Sort everyone by score ascending (lowest score is worst)
  const allStats = submissions.map(s => ({
     playerId: s.playerId,
     score: playerStats[s.playerId]?.myScore ?? 0,
  })).sort((a, b) => a.score - b.score);
  
  // Rank them (1 is best)
  allStats.reverse();
  allStats.forEach((s, idx) => {
     if (playerStats[s.playerId]) {
       playerStats[s.playerId].rank = idx + 1;
     }
  });

  const elimCount = Math.min(config.config.eliminationValue || 1, submissions.length - 1);
  const eliminatedPlayerIds = allStats.slice(allStats.length - elimCount).map(s => s.playerId);
  
  return {
    results: { pairs, playerStats, penalty, bonus, totalPlayers: submissions.length, medianValue },
    eliminatedPlayerIds
  };
}

export function calculateA4(submissions: Submission[], config: GameSlotConfig): CalculationResult {
  const customOpts = config.config.gameSpecificConfig?.customOptions as string[] | undefined;
  const options = customOpts && customOpts.length > 0 && customOpts.some(o => o.trim() !== "") 
     ? customOpts 
     : ["Option A", "Option B", "Option C", "Option D"];

  // value is array of strings e.g. ["B", "C", "A", "D"]
  const points: Record<string, number> = {};
  const firstChoiceCounts: Record<string, number> = {};
  
  options.forEach(o => {
    points[o] = 0;
    firstChoiceCounts[o] = 0;
  });
  
  submissions.forEach(s => {
    if (Array.isArray(s.value)) {
      s.value.forEach((opt: string, index: number) => {
        const pts = index === 0 ? 3 : index === 1 ? 2 : index === 2 ? 1 : 0;
        points[opt] = (points[opt] || 0) + pts;
        
        if (index === 0) {
           firstChoiceCounts[opt] = (firstChoiceCounts[opt] || 0) + 1;
        }
      });
    }
  });

  const sortedOpts = Object.entries(points).map(([opt, pts]) => ({opt, pts})).sort((a, b) => b.pts - a.pts);
  if (sortedOpts.length < 2) return { results: { secondPlaceOption: null, sortedOpts: [], firstChoiceCounts }, eliminatedPlayerIds: [] };

  const firstPlaceOption = sortedOpts[0].opt;
  const secondPlaceOption = sortedOpts[1].opt;
  
  // Only players who ranked 2nd place option as their 1st choice survive! Everyone else eliminated.
  const survivalIds = submissions.filter(s => Array.isArray(s.value) && s.value[0] === secondPlaceOption).map(s => s.playerId);
  const eliminatedPlayerIds = submissions.filter(s => !survivalIds.includes(s.playerId)).map(s => s.playerId);

  return {
    results: { secondPlaceOption, firstPlaceOption, points, sortedOpts, firstChoiceCounts, totalPlayers: submissions.length },
    eliminatedPlayerIds
  };
}

export function calculateB7(submissions: Submission[], config: GameSlotConfig): CalculationResult {
  // GameB7.tsx submits integers: 1 = Route 1, 2 = Route 2
  const threshold = config.config.gameSpecificConfig?.threshold || 30;
  const bonus = config.config.gameSpecificConfig?.bonus || 0;

  const route1Count = submissions.filter(s => Number(s.value) === 1).length;
  const route2Count = submissions.filter(s => Number(s.value) === 2).length;

  // Route 2 is slower when its count >= threshold (strict per spec)
  const r2Slower = route2Count >= threshold;
  const eliminatedRouteNum = r2Slower ? 2 : 1;
  const fastRouteNum = r2Slower ? 1 : 2;

  const eliminatedPlayerIds = submissions
    .filter(s => Number(s.value) === eliminatedRouteNum)
    .map(s => s.playerId);

  // Underdog bonus: players on the route with fewer people
  const underdogRoute = route1Count < route2Count ? 1 : 2;

  return {
    results: {
      route1Count,
      route2Count,
      eliminatedRoute: eliminatedRouteNum,
      threshold,
      bonus,
      underdogRoute
    },
    eliminatedPlayerIds
  };
}

export function calculateC10(submissions: Submission[], config: GameSlotConfig): CalculationResult {
  const sequence: number[] = config.config.gameSpecificConfig?.numberSequence || [];
  const optimalWindowEnabled = config.config.gameSpecificConfig?.optimalBonus !== false;
  const optimalBonus = 30;
  
  // Survival: top N% or top N players
  const elimPercentage = config.config.eliminationValue || 80; // bottom 80% eliminated
  
  // Each submission.value may be a scalar OR an object {value, claimedAtIndex, autoAssigned}
  // Normalize before processing
  const normalizedSubs = submissions.map(sub => {
    const raw = sub.value;
    if (raw !== null && typeof raw === "object") {
      return { ...sub, value: Number(raw.value ?? 0), claimedAtIndex: raw.claimedAtIndex ?? null, autoAssigned: raw.autoAssigned ?? false };
    }
    return { ...sub, value: Number(raw ?? 0), claimedAtIndex: sub.claimedAtIndex ?? null, autoAssigned: sub.autoAssigned ?? false };
  });

  const sorted = [...normalizedSubs].sort((a, b) => b.value - a.value);
  const elimCount = Math.floor(submissions.length * (elimPercentage / 100));
  const surviveCount = submissions.length - elimCount;
  
  const peakNumber = sequence.length > 0 ? Math.max(...sequence) : 0;
  const peakPosition = sequence.indexOf(peakNumber);
  
  const eliminatedPlayerIds: string[] = [];
  const playerStats: Record<string, any> = {};
  
  sorted.forEach((sub, rank0) => {
    const rank = rank0 + 1;
    const claimed = sub.value;
    const eliminated = rank > surviveCount;
    
    // Find which position index they claimed at (stored in sub.claimedAtIndex if we track it)
    const claimedAtPos = sub.claimedAtIndex ?? null; // 0-based position in sequence
    const inOptimalWindow = claimedAtPos !== null && claimedAtPos >= 7 && claimedAtPos <= 11;
    const bonus = optimalWindowEnabled && inOptimalWindow && !eliminated ? optimalBonus : 0;
    
    let reason = "";
    if (eliminated) {
      if (claimedAtPos !== null && claimedAtPos <= 2) reason = `Claimed too early: ${claimed} at position ${claimedAtPos + 1}.`;
      else if (sub.autoAssigned) reason = `Did not claim — assigned last number (${claimed}).`;
      else reason = `You were close: claimed ${claimed}, but the cutoff was higher.`;
    } else {
      if (inOptimalWindow) reason = `Optimal window claim at position ${claimedAtPos! + 1}. Smart timing.`;
      else reason = `Claimed ${claimed} and ranked #${rank}.`;
    }
    
    playerStats[sub.playerId] = { rank, claimed, eliminated, reason, bonus, claimedAtPos, inOptimalWindow };
    if (eliminated) eliminatedPlayerIds.push(sub.playerId);
  });

  return {
    results: { playerStats, peakNumber, peakPosition, totalPlayers: submissions.length, surviveCount },
    eliminatedPlayerIds
  };
}

export function runGenericCalculator(submissions: Submission[], config: GameSlotConfig): CalculationResult {
  switch (config.gameId) {
    case "A1": return calculateA1(submissions, config);
    case "A2": return calculateA2(submissions, config);
    case "A3": return calculateA3(submissions, config);
    case "A4": return calculateA4(submissions, config);
    case "B6": return calculateB6Fallback(submissions, config);
    case "B7": return calculateB7(submissions, config);
    case "C10": return calculateC10(submissions, config);
    default: return { results: { message: "Manual grading / physical game." }, eliminatedPlayerIds: [] };
  }
}

// B6 fallback when not using the dedicated route
function calculateB6Fallback(submissions: Submission[], config: GameSlotConfig): CalculationResult {
  if (submissions.length === 0) return { results: {}, eliminatedPlayerIds: [] };
  
  const elimMode = config.config.eliminationMode || "percentage";
  const elimValue = config.config.eliminationValue || 80;
  
  const sorted = [...submissions].sort((a, b) => Number(a.value || 0) - Number(b.value || 0));
  
  let elimCount = 0;
  if (elimMode === "percentage") {
    elimCount = Math.floor(sorted.length * (elimValue / 100));
  } else {
    elimCount = elimValue;
  }
  
  elimCount = Math.min(elimCount, Math.max(0, sorted.length - 1));
  if (elimCount < 0) elimCount = 0;
  
  const cutOffBid = elimCount > 0 ? Number(sorted[elimCount - 1].value || 0) : 0;
  
  let eliminatedIds = sorted
    .filter(s => Number(s.value || 0) <= cutOffBid && elimCount > 0)
    .map(s => s.playerId);
  
  // Safety: always keep at least 1 survivor
  if (eliminatedIds.length >= sorted.length && sorted.length > 1) {
    eliminatedIds = eliminatedIds.slice(0, eliminatedIds.length - 1);
  }
  
  const histogram: Record<number, number> = {};
  sorted.forEach(s => {
    const bid = Number(s.value || 0);
    histogram[bid] = (histogram[bid] || 0) + 1;
  });
  
  const highestBid = sorted.length > 0 ? Number(sorted[sorted.length - 1].value || 0) : 0;
  
  return {
    results: {
      cutOffBid,
      elimCount,
      highestBid,
      histogram,
      eliminatedCount: eliminatedIds.length,
      survivedCount: sorted.length - eliminatedIds.length,
    },
    eliminatedPlayerIds: eliminatedIds
  };
}
