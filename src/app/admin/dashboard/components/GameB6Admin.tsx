import { useState, useMemo } from "react";
import { db } from "@/lib/firebase";
import { GameState } from "@/lib/services/game-service";
import { PlayerData } from "@/lib/services/player-service";

interface Props {
  gameState: GameState;
  players: PlayerData[];
  onUpdateGameState?: (update: Partial<GameState>) => void;
  startTimer?: (duration: number) => Promise<{ success: boolean; error?: string }>;
}

export default function GameB6Admin({ gameState, players, onUpdateGameState, startTimer }: Props) {
  const [previewCutoff, setPreviewCutoff] = useState(50);
  
  const alivePlayers = players.filter(p => p.status === "alive");
  const submissions = alivePlayers.filter(p => p.currentSubmission !== null && p.currentSubmission !== undefined);
  
  const { avgContent, lowest, highest, counts, buckets } = useMemo(() => {
    const rawScores = submissions.map(p => Number(p.currentSubmission)).filter(n => !isNaN(n));
    if (rawScores.length === 0) return { avgContent: 0, lowest: null, highest: null, counts: {}, buckets: Array(20).fill(0) };

    const sum = rawScores.reduce((a, b) => a + b, 0);
    const avgContent = sum / rawScores.length;
    const lowest = Math.min(...rawScores);
    const highest = Math.max(...rawScores);
    
    const counts: Record<number, number> = {};
    const buckets = Array(20).fill(0); // 1-5, 6-10 ... 96-100
    rawScores.forEach(val => {
      counts[val] = (counts[val] || 0) + 1;
      const bIdx = Math.min(19, Math.floor((val - 1) / 5));
      buckets[Math.max(0, bIdx)]++;
    });

    return { avgContent, lowest, highest, counts, buckets };
  }, [submissions]);

  const maxBucketCount = Math.max(...buckets, 1);
  const eliminatedPreviewCount = useMemo(() => {
    return submissions.filter(p => Number(p.currentSubmission) <= previewCutoff).length;
  }, [submissions, previewCutoff]);

  const gsc = (gameState as any).gameSpecificConfig || {};
  const currentRevealStep = gsc.revealStep || 0;
  const currentBiddingRound = gsc.biddingRound || 1;
  const isRevealPhase = gameState.phase === "reveal" || gameState.phase === "confirm";
  const isLobby = gameState.phase === "lobby";

  const handleNextRound = () => {
    if (!onUpdateGameState) return;
    if (!confirm(`Start Bidding Round ${currentBiddingRound + 1}? This will reset submissions and deduct coins from players.`)) return;

    import("firebase/firestore").then(({ writeBatch, doc }) => {
       const batch = writeBatch(db);
       
       // Process coins
       const currentCoins: Record<string, number> = gsc.playerCoins || {};
       const newCoins = { ...currentCoins };

       alivePlayers.forEach(p => {
         // Initialize if empty
         if (newCoins[p.id] === undefined) newCoins[p.id] = 100;

         const bid = Number(p.currentSubmission);
         if (!isNaN(bid) && bid > 0) {
            newCoins[p.id] = Math.max(0, newCoins[p.id] - bid);
         }

         // Reset submission
         batch.update(doc(db, "players", p.id), { 
           currentSubmission: null, 
           autoSubmitted: false 
         });
       });

       // Update game state
       batch.update(doc(db, "system", "gameState"), {
          phase: "active",
          results: null,
          submissionsCount: 0,
          "gameSpecificConfig.playerCoins": newCoins,
          "gameSpecificConfig.biddingRound": currentBiddingRound + 1,
          "gameSpecificConfig.revealStep": 0
       });

       batch.commit().catch(e => {
          console.error(e);
          alert("Failed to start next round: " + e.message);
       });
    });
  };

  return (
    <div className="w-full space-y-6">
       {isLobby && (
          <div className="w-full bg-secondary/10 border border-secondary p-6 text-center">
              <button
                 onClick={async () => {
                    if (!onUpdateGameState) return;
                    const duration = gameState.timerDuration || 60;
                    onUpdateGameState({
                       phase: "active",
                       submissionsCount: 0,
                       playersAlive: alivePlayers.length
                    });
                    if (startTimer) {
                       await startTimer(duration);
                    }
                 }}
                className="w-full py-4 text-xl bg-secondary text-background font-bold tracking-widest uppercase hover:bg-white transition-colors"
             >
                OPEN BIDDING (START GAME)
             </button>
             {alivePlayers.length === 0 && <p className="text-secondary text-xs mt-2">Warning: 0 players alive in the lobby.</p>}
          </div>
       )}

       {!isLobby && (
          <>
             <div className="border border-border bg-surface p-4 grid grid-cols-4 gap-4 text-center">
          <div><p className="text-[10px] text-textMuted uppercase mb-1">Submissions</p><p className="text-xl">{submissions.length} / {alivePlayers.length}</p></div>
          <div><p className="text-[10px] text-textMuted uppercase mb-1">Average Bid</p><p className="text-xl font-bold">{avgContent.toFixed(1)}</p></div>
          <div><p className="text-[10px] text-primary uppercase mb-1">Lowest</p><p className="text-xl text-primary font-bold">{lowest ?? '—'}</p></div>
          <div><p className="text-[10px] text-secondary uppercase mb-1">Highest</p><p className="text-xl text-secondary font-bold">{highest ?? '—'}</p></div>
       </div>

       <div className="border border-border bg-surface p-6 font-mono relative overflow-hidden">
          <p className="text-xs uppercase tracking-widest text-textMuted mb-6 text-center">Live Bid Distribution (1-100)</p>
          <div className="flex items-end justify-between h-40 gap-1 w-full relative">
             {buckets.map((b, i) => (
                <div key={i} className="flex-1 flex flex-col justify-end items-center group relative h-full">
                   <div 
                     className="w-full bg-white/20 transition-all group-hover:bg-white/40" 
                     style={{ height: `${(b / maxBucketCount) * 100}%`, minHeight: b > 0 ? '4px' : '0' }}
                   />
                   <p className="text-[8px] text-textMuted/50 mt-2 rotate-45 origin-left w-8 absolute -bottom-6">{(i*5)+1}-{i*5+5}</p>
                   {b > 0 && <span className="absolute -top-6 text-[10px] bg-background border px-1 opacity-0 group-hover:opacity-100 z-10">{b}</span>}
                </div>
             ))}
             
             {/* Draggable Cutoff Line Preview */}
             {submissions.length > 0 && !isRevealPhase && (
               <label className="absolute top-0 bottom-6 w-full cursor-col-resize z-20 flex flex-col items-center group" style={{ left: 0 }}>
                 <input 
                   type="range" min="1" max="100" 
                   value={previewCutoff} onChange={e => setPreviewCutoff(parseInt(e.target.value))} 
                   className="absolute bottom-6 w-full opacity-0 cursor-col-resize"
                 />
                 <div className="absolute top-0 bottom-6 border-l-2 border-primary border-dashed" style={{ left: `${(previewCutoff / 100) * 100}%` }} />
                 <div className="absolute -top-6 bg-primary text-white text-[10px] px-2 py-1 pointer-events-none transition-opacity opacity-0 group-hover:opacity-100" style={{ left: `${(previewCutoff / 100) * 100}%`, transform: 'translateX(-50%)' }}>
                   Cutoff ≤ {previewCutoff}
                 </div>
               </label>
             )}
          </div>
          
          {submissions.length > 0 && !isRevealPhase && (
             <div className="mt-12 text-center text-[10px] text-textMuted uppercase tracking-widest">
               Previewing cutoff at {previewCutoff} would eliminate <span className="text-primary font-bold">{eliminatedPreviewCount}</span> players.
             </div>
          )}
       </div>

       {isRevealPhase && onUpdateGameState && (
         <div className="border border-secondary/50 bg-secondary/5 p-4 space-y-3 mt-4">
           <p className="text-[10px] text-secondary uppercase tracking-widest font-bold">Reveal Sequence Control</p>
           <p className="text-[10px] text-textMuted">Step {currentRevealStep} / 4</p>
           <div className="grid grid-cols-2 gap-2 text-xs">
             {[
               { step: 1, label: "Reveal Distribution" },
               { step: 2, label: "Reveal Cutoff Zone" },
               { step: 3, label: "Reveal Highest Bid" },
               { step: 4, label: "Show Personal Verdicts" },
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
           <div className="pt-4 border-t border-secondary/20 mt-4">
             <button
                onClick={handleNextRound}
                className="w-full py-3 bg-background border border-primary text-primary hover:bg-primary hover:text-white transition uppercase tracking-widest text-xs font-bold shadow-glow-red"
             >
                START NEXT BIDDING ROUND
             </button>
           </div>
         </div>
       )}
          </>
       )}
    </div>
  );
}
