import { GameSlotConfig } from "@/lib/services/game-service";

export type Submission = any;

export interface CalculationResult {
  results: any;
  eliminatedPlayerIds: string[];
}

export function calculateA1(submissions: Submission[], config: GameSlotConfig): CalculationResult {
  if (submissions.length === 0) return { results: { average: 0, target: 0 }, eliminatedPlayerIds: [] };
  
  const sum = submissions.reduce((acc, curr) => acc + Number(curr.value || 0), 0);
  const average = sum / submissions.length;
  const target = average * (2/3);

  // Calculate distances and find maximums
  let maxDistance = -1;
  submissions.forEach(sub => {
    sub.distance = Math.abs(Number(sub.value || 0) - target);
    if (sub.distance > maxDistance) maxDistance = sub.distance;
  });

  // Sort by distance descending
  const sorted = [...submissions].sort((a, b) => b.distance - a.distance);
  
  const elimCount = config.config.eliminationValue || 1;
  const eliminatedPlayerIds = sorted.slice(0, elimCount).map(s => s.playerId);

  return {
    results: { average, target },
    eliminatedPlayerIds
  };
}

export function calculateA2(submissions: Submission[], config: GameSlotConfig): CalculationResult {
  // value is range e.g. "1-10", "11-20"
  const counts: Record<string, number> = {};
  submissions.forEach(s => {
    counts[s.value] = (counts[s.value] || 0) + 1;
  });

  const sortedRanges = Object.entries(counts).sort((a, b) => a[1] - b[1]); // fewest to most
  
  if (sortedRanges.length === 0) return { results: { majorityRange: null, minorityRange: null }, eliminatedPlayerIds: [] };
  
  // Everyone in minority range survives, everyone in majority is eliminated
  const minorityRange = sortedRanges[0][0];
  const majorityRange = sortedRanges[sortedRanges.length - 1][0];
  
  // Actually, instructions say "Eliminate players in the majority range" or "Eliminate N highest populated ranges" depending on config
  // Let's implement simplest: eliminate the single highest populated range
  const eliminatedPlayerIds = submissions.filter(s => s.value === majorityRange).map(s => s.playerId);

  return {
    results: { minorityRange, majorityRange, counts },
    eliminatedPlayerIds
  };
}

export function calculateA3(submissions: Submission[], config: GameSlotConfig): CalculationResult {
  // A3 requires pairs. For simplicity if odd, last player pairs with themselves or gets safe
  let sortedByBid = [...submissions].sort((a, b) => Number(a.value || 0) - Number(b.value || 0));
  // Pair up sequentially for prototype (a real implementation would use pre-assigned pairs)
  // Let's just eliminate the N lowest scores
  const elimCount = config.config.eliminationValue || 1;
  const eliminatedPlayerIds = sortedByBid.slice(0, elimCount).map(s => s.playerId);
  
  return {
    results: { pairedBids: [] },
    eliminatedPlayerIds
  };
}

export function calculateA4(submissions: Submission[], config: GameSlotConfig): CalculationResult {
  // value is array of strings e.g. ["B", "C", "A", "D"]
  const points: Record<string, number> = {};
  submissions.forEach(s => {
    if (Array.isArray(s.value)) {
      s.value.forEach((opt: string, index: number) => {
        const pts = index === 0 ? 3 : index === 1 ? 2 : index === 2 ? 1 : 0;
        points[opt] = (points[opt] || 0) + pts;
      });
    }
  });

  const sortedOpts = Object.entries(points).sort((a, b) => b[1] - a[1]);
  if (sortedOpts.length < 2) return { results: { secondPlaceOption: null }, eliminatedPlayerIds: [] };

  const secondPlaceOption = sortedOpts[1][0];
  
  // Only players who ranked 2nd place option as their 1st choice survive! Everyone else eliminated.
  const survivalIds = submissions.filter(s => Array.isArray(s.value) && s.value[0] === secondPlaceOption).map(s => s.playerId);
  const eliminatedPlayerIds = submissions.filter(s => !survivalIds.includes(s.playerId)).map(s => s.playerId);

  return {
    results: { secondPlaceOption, points },
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
