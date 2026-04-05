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
  const target = average * (2/3);

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

  const sortedRanges = Object.entries(counts).sort((a, b) => a[1] - b[1]); // fewest to most
  
  if (submissions.length === 0) return { results: { majorityRange: null, minorityRange: null, sortedRanges: [], totalPlayers: 0 }, eliminatedPlayerIds: [] };
  
  const minorityRange = sortedRanges[0][0];
  const majorityRange = sortedRanges[sortedRanges.length - 1][0];
  
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
  
  // Shuffle submissions for pairing
  const shuffled = [...submissions].sort(() => Math.random() - 0.5);
  
  const pairs: any[] = [];
  const playerStats: Record<string, any> = {};
  
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
       // Odd player out, safe with median score
       const v1 = Number(p1.value || 0);
       pairs.push({
         player1Id: p1.playerId, player1Uid: p1.id, val1: v1, score1: v1, p1Bonus: 0,
         player2Id: null, player2Uid: null, val2: null, score2: 0, p2Bonus: 0
       });
       playerStats[p1.playerId] = { opponentVal: null, myScore: v1, myBonus: 0 };
    }
  }

  // Sort everyone by score ascending (lowest score is worst)
  const allStats = submissions.map(s => ({
     playerId: s.playerId,
     score: playerStats[s.playerId].myScore
  })).sort((a, b) => a.score - b.score);
  
  // Rank them (1 is best)
  allStats.reverse();
  allStats.forEach((s, idx) => {
     playerStats[s.playerId].rank = idx + 1;
  });

  const elimCount = config.config.eliminationValue || 1;
  const eliminatedPlayerIds = allStats.slice(allStats.length - elimCount).map(s => s.playerId);
  
  return {
    results: { pairs, playerStats, penalty, bonus, totalPlayers: submissions.length },
    eliminatedPlayerIds
  };
}

export function calculateA4(submissions: Submission[], config: GameSlotConfig): CalculationResult {
  // value is array of strings e.g. ["B", "C", "A", "D"]
  const points: Record<string, number> = {};
  const firstChoiceCounts: Record<string, number> = {};
  
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
  // value is "Route 1" or "Route 2"
  const threshold = config.config.gameSpecificConfig?.threshold || 30;
  
  const route2Count = submissions.filter(s => s.value === "Route 2").length;
  const route1Count = submissions.filter(s => s.value === "Route 1").length;
  
  let eliminatedRoute = route2Count >= threshold ? "Route 2" : "Route 1";
  
  const eliminatedPlayerIds = submissions.filter(s => s.value === eliminatedRoute).map(s => s.playerId);

  return {
    results: { route1Count, route2Count, eliminatedRoute },
    eliminatedPlayerIds
  };
}

export function calculateC10(submissions: Submission[], config: GameSlotConfig): CalculationResult {
  // value: claimed number
  const sorted = [...submissions].sort((a, b) => Number(b.value || 0) - Number(a.value || 0)); // Highest survived
  
  const elimPercentage = config.config.eliminationValue || 80; // Default eliminate bottom 80%
  const elimCount = Math.floor(submissions.length * (elimPercentage / 100));
  
  const eliminatedSeries = sorted.slice(sorted.length - elimCount);
  const eliminatedPlayerIds = eliminatedSeries.map(s => s.playerId);

  return {
    results: { topClaim: sorted[0]?.value },
    eliminatedPlayerIds
  };
}

export function runGenericCalculator(submissions: Submission[], config: GameSlotConfig): CalculationResult {
  switch (config.gameId) {
    case "A1": return calculateA1(submissions, config);
    case "A2": return calculateA2(submissions, config);
    case "A3": return calculateA3(submissions, config);
    case "A4": return calculateA4(submissions, config);
    case "B7": return calculateB7(submissions, config);
    case "C10": return calculateC10(submissions, config);
    // Add default fallbacks for manual/physical games:
    // They don't auto calculate eliminations, Admin confirms manually or uses points system.
    default: return { results: { message: "Manual grading / physical game." }, eliminatedPlayerIds: [] };
  }
}
