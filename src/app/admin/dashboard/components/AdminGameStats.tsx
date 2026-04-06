import { GameState } from "@/lib/services/game-service";
import { PlayerData } from "@/lib/services/player-service";
import GameB6Admin from "./GameB6Admin";
import GameB8Admin from "./GameB8Admin";
import GameC9Admin from "./GameC9Admin";
import GameLemonsAdmin from "./GameLemonsAdmin";
import GameSilenceAdmin from "./GameSilenceAdmin";
import GameB5Admin from "./GameB5Admin";

interface Props {
  gameState: GameState;
  players: PlayerData[];
  onUpdateGameState?: (update: Partial<GameState>) => void;
  activeGameId?: string;
  startTimer?: (duration: number) => Promise<{ success: boolean; error?: string }>;
}

export default function AdminGameStats({ gameState, players, onUpdateGameState, activeGameId, startTimer }: Props) {
  const alivePlayers = players.filter(p => p.status === "alive");
  const submissions = alivePlayers.filter(p => p.currentSubmission !== null && p.currentSubmission !== undefined);
  const gsc = (gameState as any).gameSpecificConfig || {};
  const targetGameId = activeGameId || gameState.currentGameId;

  if (targetGameId === "A1") {
    const bucketSize = 10;
    const buckets = Array.from({ length: 10 }, () => 0);
    let sum = 0;
    submissions.forEach(p => {
       const val = Number(p.currentSubmission);
       if (!isNaN(val)) { sum += val; const bIdx = Math.min(9, Math.floor(val / bucketSize)); buckets[bIdx]++; }
    });
    const avg = submissions.length > 0 ? (sum / submissions.length) : 0;
    const target = avg * (2/3);
    return (
      <div className="w-full space-y-4">
         <div className="flex justify-between text-xs tracking-widest uppercase border border-border bg-surface p-4 text-center">
            <div><p className="text-textMuted mb-2">Live Average</p><p className="text-xl text-textDefault font-bold">{avg.toFixed(2)}</p></div>
            <div><p className="text-secondary mb-2">Live Target (2/3)</p><p className="text-xl text-secondary font-bold">{target.toFixed(2)}</p></div>
         </div>
         <div className="w-full bg-surface border border-border p-4">
            <p className="text-xs uppercase tracking-widest text-textMuted mb-4 text-center">Live Distribution</p>
            <div className="flex items-end justify-between h-24 gap-1">
               {buckets.map((b, i) => {
                 const pct = submissions.length > 0 ? (b / submissions.length) * 100 : 0;
                 return (
                   <div key={i} className="flex-1 flex flex-col justify-end items-center group relative">
                     <div className="w-full bg-primary/80 transition-all" style={{ height: `${pct}%`, minHeight: b > 0 ? '4px' : '0' }}></div>
                     <p className="text-[8px] text-textMuted mt-1">{i*10}-{(i+1)*10}</p>
                     {b > 0 && <span className="absolute -top-6 text-[10px] bg-background border px-1 opacity-0 group-hover:opacity-100">{b}</span>}
                   </div>
                 )
               })}
            </div>
         </div>
      </div>
    );
  }

  if (targetGameId === "A2") {
    const counts: Record<string, number> = {};
    const rangesList = ["1-10", "11-20", "21-30", "31-40", "41-50", "51-60", "61-70", "71-80", "81-90", "91-100"];
    rangesList.forEach(r => counts[r] = 0);
    submissions.forEach(p => { if (typeof p.currentSubmission === "string") counts[p.currentSubmission]++; });
    return (
       <div className="w-full space-y-4 border p-4 bg-surface border-border">
          <p className="text-xs uppercase tracking-widest text-textMuted mb-4 text-center">Live Population Map</p>
          <div className="grid grid-cols-2 gap-4">
             {rangesList.map(r => {
                const c = counts[r];
                const pct = submissions.length > 0 ? (c / submissions.length) * 100 : 0;
                const isCrowded = pct > 20;
                return (
                   <div key={r} className="flex items-center space-x-2 text-xs font-mono">
                      <span className="w-16">{r}</span>
                      <div className="flex-1 h-3 bg-background border border-border relative">
                         <div className={`absolute left-0 top-0 bottom-0 transition-all ${isCrowded ? 'bg-primary' : 'bg-textMuted'}`} style={{width: `${pct}%`}} />
                      </div>
                      <span className={isCrowded ? 'text-primary font-bold' : 'text-textMuted'}>{c}</span>
                   </div>
                );
             })}
          </div>
       </div>
    );
  }

  if (targetGameId === "A3") {
     const sum = submissions.reduce((acc, curr) => acc + Number(curr.currentSubmission || 0), 0);
     const avg = submissions.length > 0 ? sum / submissions.length : 0;
     const buckets = Array.from({ length: 11 }, () => 0);
     submissions.forEach(p => { const val = Number(p.currentSubmission); if (!isNaN(val)) { const bIdx = Math.min(10, Math.floor(val / 10)); buckets[bIdx]++; } });
     return (
       <div className="w-full space-y-4">
          <div className="text-center p-4 border border-border bg-surface">
             <p className="text-xs text-textMuted uppercase tracking-widest">Average Bid</p>
             <p className="text-2xl font-bold">{avg.toFixed(1)}</p>
          </div>
          <div className="w-full bg-surface border border-border p-4">
            <p className="text-[10px] uppercase tracking-widest text-textMuted mb-2 text-center">Bid Distribution (0-100)</p>
            <div className="flex items-end justify-between h-16 gap-1">
               {buckets.map((b, i) => { const pct = submissions.length > 0 ? (b / submissions.length) * 100 : 0; return (<div key={i} className="flex-1 bg-secondary/80 transition-all" style={{ height: `${pct}%`, minHeight: b > 0 ? '2px' : '0' }}></div>) })}
            </div>
         </div>
       </div>
     );
  }

  if (targetGameId === "A4") {
     const firstChoices: Record<string, number> = {};
     let majorityBet = ""; let maxBets = -1;
     submissions.forEach(p => {
        const arr = p.currentSubmission;
        if (Array.isArray(arr) && arr.length > 0) { const first = arr[0]; firstChoices[first] = (firstChoices[first] || 0) + 1; if (firstChoices[first] > maxBets) { maxBets = firstChoices[first]; majorityBet = first; } }
     });
     return (
       <div className="w-full space-y-4 border p-4 bg-surface border-border">
          <p className="text-xs uppercase tracking-widest text-textMuted mb-4 text-center">1st Choice Distribution</p>
          {Object.keys(firstChoices).length === 0 ? <p className="text-center text-sm text-textMuted">No votes ranked yet</p> : (
            <div className="space-y-2 text-xs font-mono">
               {Object.entries(firstChoices).sort((a,b) => b[1] - a[1]).map(([opt, bets]) => (
                  <div key={opt} className="flex justify-between items-center p-2 border border-border bg-background">
                     <span className="uppercase">{opt}</span><span>{bets} betting this is 2nd</span>
                  </div>
               ))}
            </div>
          )}
          {majorityBet && <p className="text-xs text-primary mt-4 border-l-2 border-primary pl-2 uppercase tracking-widest">Most believe <span className="font-bold">{majorityBet}</span> will win.</p>}
       </div>
     );
  }

  // ──────────────────────────────────────────────
  // B7 — Braess Paradox Live Split Meter
  // ──────────────────────────────────────────────
  if (targetGameId === "B7") {
    const threshold = gsc.threshold || 0;
    const r1 = submissions.filter(p => p.currentSubmission === 1).length;
    const r2 = submissions.filter(p => p.currentSubmission === 2).length;
    const total = r1 + r2;
    const r2Slower = r2 >= threshold;
    const currentRevealStep = gsc.revealStep || 0;

    const isRevealPhase = gameState.phase === "reveal" || gameState.phase === "confirm";

    return (
      <div className="w-full space-y-6">
        {/* Live split bar */}
        <div className="border border-border bg-surface p-4 space-y-4">
          <p className="text-[10px] uppercase tracking-widest text-textMuted text-center">Live Route Split</p>
          <div className="flex h-8 w-full border border-border overflow-hidden relative">
            <div className="h-full bg-textMuted/60 transition-all duration-500" style={{width: total > 0 ? `${(r1/total)*100}%` : '50%'}}></div>
            <div className={`h-full transition-all duration-500 ${r2Slower ? 'bg-primary' : 'bg-secondary/60'}`} style={{width: total > 0 ? `${(r2/total)*100}%` : '50%'}}></div>
            {/* Threshold marker */}
            {total > 0 && <div className="absolute top-0 bottom-0 w-0.5 bg-secondary shadow-glow-gold" style={{left: `${(threshold/Math.max(total, 1))*100}%`}}></div>}
          </div>
          <div className="flex justify-between text-xs font-mono">
            <span className="text-textMuted">Route 1: <span className="text-textDefault font-bold">{r1}</span></span>
            <span className="text-secondary text-[10px] uppercase tracking-widest">Threshold: {threshold}</span>
            <span className={r2Slower ? 'text-primary font-bold' : 'text-secondary'}>Route 2: {r2} {r2Slower ? '⚠ SLOWER' : '✓ FASTER'}</span>
          </div>
        </div>

        <div className="border border-border bg-surface p-4 text-xs font-mono space-y-2">
          <p className="uppercase tracking-widest text-textMuted">Submissions: {submissions.length} / {alivePlayers.length}</p>
          <p className={`uppercase tracking-widest font-bold ${r2Slower ? 'text-primary' : 'text-secondary'}`}>
            Current Outcome: Route {r2Slower ? '2' : '1'} is SLOWER → Route {r2Slower ? '2' : '1'} players ELIMINATED
          </p>
        </div>

        {/* Reveal Step Control — only visible during reveal phase */}
        {isRevealPhase && onUpdateGameState && (
          <div className="border border-secondary/50 bg-secondary/5 p-4 space-y-3">
            <p className="text-[10px] text-secondary uppercase tracking-widest font-bold">Reveal Sequence Control</p>
            <p className="text-[10px] text-textMuted">Step {currentRevealStep} / 4 — Click each step after pausing to let tension build</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                { step: 1, label: "Show Vote Counts" },
                { step: 2, label: "Reveal Threshold" },
                { step: 3, label: "Show Route Verdict" },
                { step: 4, label: "Personal Verdicts" },
              ].map(({ step, label }) => (
                <button
                  key={step}
                  disabled={currentRevealStep >= step}
                  onClick={() => onUpdateGameState({ gameSpecificConfig: { ...gsc, revealStep: step } } as any)}
                  className={`p-2 border uppercase tracking-widest transition-colors
                    ${currentRevealStep >= step ? 'bg-surface border-border text-textMuted/40 cursor-not-allowed' : 'border-secondary text-secondary hover:bg-secondary hover:text-background cursor-pointer font-bold'}`}
                >
                  {step}. {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ──────────────────────────────────────────────
  // C10 — Peak Finder Number Reveal Controller
  // ──────────────────────────────────────────────
  if (targetGameId === "C10") {
    const sequence: number[] = gsc.numberSequence || [];
    const currentIndex: number = gsc.currentNumberIndex || 0;
    const currentNumber = currentIndex > 0 && currentIndex <= sequence.length ? sequence[currentIndex - 1] : null;
    const claimedPlayers = submissions.filter(p => p.currentSubmission !== null);
    const unclaimedCount = alivePlayers.length - claimedPlayers.length;

    const revealNext = () => {
      if (!onUpdateGameState || currentIndex >= 20) return;
      onUpdateGameState({ gameSpecificConfig: { ...gsc, currentNumberIndex: currentIndex + 1 } } as any);
    };

    const claimLeaderboard = [...claimedPlayers].sort((a, b) => {
      const getVal = (p: PlayerData) => {
        const sub = p.currentSubmission;
        if (sub === null || sub === undefined) return 0;
        if (typeof sub === "object") return Number(sub.value ?? 0);
        return Number(sub);
      };
      return getVal(b) - getVal(a);
    });

    return (
      <div className="w-full space-y-6">
        {/* Current number display */}
        <div className="border border-border bg-surface p-6 text-center">
          <p className="text-[10px] text-textMuted uppercase tracking-widest mb-2">Position {currentIndex} / 20</p>
          {currentNumber !== null ? (
            <p className={`font-mono text-6xl font-bold ${currentNumber >= 70 ? 'text-secondary' : currentNumber >= 34 ? 'text-textDefault' : 'text-primary'}`}>
              {currentNumber}
            </p>
          ) : (
            <p className="font-mono text-3xl text-textMuted">—</p>
          )}
          <div className="mt-4 flex justify-between text-xs font-mono text-textMuted">
            <span>Claimed: {claimedPlayers.length}</span>
            <span>Unclaimed: {unclaimedCount}</span>
          </div>
          <div className="w-full bg-background border border-border h-1.5 mt-3 overflow-hidden">
            <div className="h-full bg-secondary transition-all duration-500" style={{width: `${(claimedPlayers.length / Math.max(alivePlayers.length, 1)) * 100}%`}}></div>
          </div>
        </div>

        {/* Reveal sequence mini-map */}
        <div className="border border-border bg-surface p-4">
          <p className="text-[10px] uppercase tracking-widest text-textMuted mb-3">Sequence Overview</p>
          <div className="grid grid-cols-10 gap-1">
            {sequence.map((n, i) => (
              <div key={i} className={`flex flex-col items-center justify-center aspect-square border text-[9px] font-mono
                ${i < currentIndex ? 'border-border text-textMuted bg-background' : 'border-border/30 text-textMuted/30 bg-surface'}
                ${i === currentIndex - 1 ? 'border-primary shadow-glow-red' : ''}
                ${i >= 7 && i <= 11 ? 'bg-secondary/5' : ''}
              `}>
                {i < currentIndex ? n : '—'}
                <span className="text-[6px] text-textMuted/50">{i+1}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Reveal button */}
        {onUpdateGameState && gameState.phase === "active" && (
          <button
            onClick={revealNext}
            disabled={currentIndex >= 20}
            className="w-full py-4 border border-primary bg-primary/10 hover:bg-primary text-primary hover:text-background uppercase tracking-[0.2em] text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {currentIndex >= 20 ? "All 20 Numbers Revealed" : `▶ Reveal Number ${currentIndex + 1}`}
          </button>
        )}

        {/* Live claim leaderboard */}
        {claimedPlayers.length > 0 && (
          <div className="border border-border bg-surface p-4">
            <p className="text-[10px] uppercase tracking-widest text-textMuted mb-3">Live Claim Leaderboard</p>
            <div className="space-y-1 max-h-48 overflow-auto">
              {claimLeaderboard.map((p, rank) => {
                const rawSub = p.currentSubmission;
                const claimedVal = (rawSub !== null && typeof rawSub === "object") ? rawSub.value : rawSub;
                const displayVal = (claimedVal === null || claimedVal === undefined) ? "—" : String(claimedVal);
                return (
                  <div key={p.id} className="flex justify-between items-center text-xs font-mono p-2 border-b border-border/50">
                    <span className="text-textMuted">#{rank + 1}</span>
                    <span className="text-textDefault truncate max-w-[100px]">{p.name}</span>
                    <span className={`font-bold ${Number(claimedVal || 0) >= 70 ? 'text-secondary' : 'text-textDefault'}`}>{displayVal}</span>
                  </div>
                );
              })}
            </div>
            {unclaimedCount > 0 && (
              <p className="text-[10px] text-textMuted/60 mt-2 uppercase tracking-widest">{unclaimedCount} players still waiting...</p>
            )}
            {currentIndex >= 12 && unclaimedCount > 3 && (
              <p className="text-[10px] text-primary mt-1">⚠ Only {20 - currentIndex} numbers left. {unclaimedCount} players haven't claimed.</p>
            )}
          </div>
        )}
      </div>
    );
  }

  if (targetGameId === "B6") {
    return <GameB6Admin gameState={gameState} players={players} onUpdateGameState={onUpdateGameState} startTimer={startTimer} />;
  }

  if (targetGameId === "B8") {
    return <GameB8Admin gameState={gameState} players={players} onUpdateGameState={onUpdateGameState} />;
  }

  if (targetGameId === "C9") {
    return <GameC9Admin gameState={gameState} players={players} onUpdateGameState={onUpdateGameState} />;
  }

  if (targetGameId === "LEMONS") {
    return <GameLemonsAdmin gameState={gameState} players={players} onUpdateGameState={onUpdateGameState} />;
  }

  if (targetGameId === "SILENCE") {
    return <GameSilenceAdmin gameState={gameState} players={players} onUpdateGameState={onUpdateGameState} />;
  }

  if (targetGameId === "B5") {
    return <GameB5Admin gameState={gameState} players={players} onUpdateGameState={onUpdateGameState} />;
  }

  return null;
}
