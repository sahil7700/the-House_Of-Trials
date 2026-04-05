import { useState, useEffect } from "react";
import { GameState, GameSlotConfig } from "@/lib/services/game-service";
import { PlayerData } from "@/lib/services/player-service";
import { collection, writeBatch, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface Props {
  gameState: GameState;
  players: PlayerData[];
  onUpdateGameState?: (update: Partial<GameState>) => void;
}

export default function GameC9Admin({ gameState, players, onUpdateGameState }: Props) {
  const gsc = (gameState as any).gameSpecificConfig || {};
  const isLobby = gameState.phase === "lobby";
  const isPhaseA = gameState.phase === "active_a" || gameState.phase === "active"; // fallback active support
  const isPhaseA_locked = gameState.phase === "locked_a" || gameState.phase === "locked";
  const isPhaseB = gameState.phase === "active_b";
  const isPhaseB_locked = gameState.phase === "locked_b";
  const isReveal = gameState.phase === "reveal";

  const alivePlayers = players.filter((p) => p.status === "alive");

  // Configuration States
  const [tieBreaker, setTieBreaker] = useState(gsc.tieBreaker || "admin");
  const [exactMatchBonus, setExactMatchBonus] = useState(gsc.exactMatchBonus ?? true);
  const [showOpponentName, setShowOpponentName] = useState(gsc.showOpponentName ?? true);
  const [pairsCreated, setPairsCreated] = useState(gsc.pairsCreated || false);

  const handlePairPlayers = async () => {
    if (!onUpdateGameState) return;

    // Randomize players
    const shuffled = [...alivePlayers].sort(() => 0.5 - Math.random());
    const newPairs: any[] = [];
    
    for (let i = 0; i < shuffled.length; i += 2) {
      if (i + 1 < shuffled.length) {
        newPairs.push({
          pairId: `pair_${i}`,
          playerAId: shuffled[i].id,
          playerBId: shuffled[i].id,
          playerA_sequence: null,
          playerB_sequence: null,
          playerA_guess: null,
          playerB_guess: null,
          playerA_score: null,
          playerB_score: null,
          winnerId: null,
          loserId: null,
          tied: false,
        });
      }
    }

    try {
       // Persist pairs into Firestore standard pairs/slot collection
       const batch = writeBatch(db);
       const pairsDocRef = doc(db, "pairs", String(gameState.currentSlot));
       batch.set(pairsDocRef, { pairs: newPairs });
       
       // Clear player submissions
       alivePlayers.forEach(p => {
          batch.update(doc(db, "players", p.id), { currentSubmission: null });
       });

       await batch.commit();

       onUpdateGameState({
         gameSpecificConfig: {
           ...gsc,
           tieBreaker,
           exactMatchBonus,
           showOpponentName,
           pairsCreated: true
         },
         results: { pairs: newPairs }
       });
       alert("Pairs created successfully!");
    } catch (e) {
       console.error(e);
       alert("Error creating pairs");
    }
  };

  const startPhaseA = () => {
    if (!onUpdateGameState) return;
    onUpdateGameState({ phase: "active_a" });
  };

  const lockPhaseA = () => {
    if (!onUpdateGameState) return;
    onUpdateGameState({ phase: "locked_a" });
  };

  const startPhaseB = async () => {
     if (!onUpdateGameState) return;
     // When moving to Phase B, we MUST fetch current submissons (secret sequences) and bake them into the pairs doc
     try {
       const pairsDocRef = doc(db, "pairs", String(gameState.currentSlot));
       
       const currentPairs = gameState.results?.pairs || [];
       const updatedPairs = currentPairs.map((p: any) => {
          const pa = players.find(player => player.id === p.playerAId);
          const pb = players.find(player => player.id === p.playerBId);
          return {
             ...p,
             playerA_sequence: pa?.currentSubmission?.type === "sequence" ? pa.currentSubmission.value : null,
             playerB_sequence: pb?.currentSubmission?.type === "sequence" ? pb.currentSubmission.value : null
          };
       });

       const batch = writeBatch(db);
       batch.update(pairsDocRef, { pairs: updatedPairs });
       
       // Now clear currentSubs so players can type their guesses
       alivePlayers.forEach(p => {
          batch.update(doc(db, "players", p.id), { currentSubmission: null });
       });
       await batch.commit();
       
       onUpdateGameState({ 
          phase: "active_b",
          results: { pairs: updatedPairs } 
       });
     } catch (e) {
       console.error(e);
     }
  };

  const lockPhaseB = () => {
     if (!onUpdateGameState) return;
     onUpdateGameState({ phase: "locked_b" });
  };

  const renderLobby = () => (
    <div className="space-y-6 animate-fade-in">
      <div className="p-4 border border-secondary/50 bg-secondary/10">
        <h3 className="text-sm uppercase tracking-widest text-secondary font-bold mb-4">Sequence Match Configuration</h3>
        
        <div className="space-y-4">
          <div>
            <label className="text-[10px] text-textMuted uppercase tracking-widest block mb-1">Tie-Breaking Rule</label>
            <select className="w-full bg-background border border-border px-3 py-2 text-sm" value={tieBreaker} onChange={(e) => setTieBreaker(e.target.value)}>
               <option value="admin">Admin decides per pair (Default)</option>
               <option value="eliminate_both">Both eliminated</option>
               <option value="survive_both">Both survive</option>
            </select>
          </div>

          <div className="flex justify-between items-center bg-background border border-border p-3">
             <label className="text-xs uppercase tracking-widest">+10 pts Exact Match Bonus</label>
             <input type="checkbox" checked={exactMatchBonus} onChange={e => setExactMatchBonus(e.target.checked)} className="w-4 h-4" />
          </div>

          <div className="flex justify-between items-center bg-background border border-border p-3">
             <label className="text-xs uppercase tracking-widest">Show Opponent Name in Phase B</label>
             <input type="checkbox" checked={showOpponentName} onChange={e => setShowOpponentName(e.target.checked)} className="w-4 h-4" />
          </div>

          {!pairsCreated ? (
             <button onClick={handlePairPlayers} className="w-full bg-secondary/20 text-secondary border border-secondary py-3 hover:bg-secondary hover:text-black uppercase tracking-widest mt-4">
                Randomize & Pair Players
             </button>
          ) : (
             <div className="bg-green-900/20 text-green-500 border border-green-700/50 p-4 text-center">
                <p className="text-xs uppercase tracking-widest mb-4">Players Paired Successfully</p>
                <button onClick={startPhaseA} className="w-full bg-primary/20 text-primary border border-primary py-3 hover:bg-primary shadow-glow-red hover:text-white uppercase tracking-widest">
                   Open Phase A — Secret Sequences
                </button>
             </div>
          )}
        </div>
      </div>
    </div>
  );

  const submittedCount = alivePlayers.filter(p => p.currentSubmission !== null && p.currentSubmission?.type !== undefined).length;

  const renderActiveA = () => (
     <div className="space-y-4">
        <div className="flex justify-between items-center border-b border-border pb-4">
           <div>
             <p className="text-[10px] uppercase tracking-widest text-textMuted mb-1">Phase A</p>
             <h3 className="text-xl font-serif text-secondary tracking-widest">Secret Sequences</h3>
           </div>
           <div className="text-right">
             <p className="text-[10px] uppercase tracking-widest text-textMuted">Sealed</p>
             <p className="text-2xl font-mono">{submittedCount} / {alivePlayers.length}</p>
           </div>
        </div>

        <button onClick={lockPhaseA} className="w-full bg-primary text-background py-3 uppercase tracking-widest font-bold mt-4 shadow-glow-red hover:bg-primary/80">
           Lock Phase A
        </button>
     </div>
  );

  const renderActiveB = () => (
     <div className="space-y-4">
        <div className="flex flex-col border-b border-border pb-4">
           <div className="flex justify-between items-center">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-textMuted mb-1">Phase B</p>
                <h3 className="text-xl font-serif text-amber-500 tracking-widest">Opponent Guesses</h3>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-widest text-textMuted">Guessed</p>
                <p className="text-2xl font-mono text-amber-500">{submittedCount} / {alivePlayers.length}</p>
              </div>
           </div>
           {isPhaseA_locked && !isPhaseB && (
              <button onClick={startPhaseB} className="w-full bg-amber-500/20 text-amber-500 border border-amber-500 py-3 uppercase tracking-widest font-bold mt-6 shadow-glow-gold hover:bg-amber-500 hover:text-black">
                 Start Phase B
              </button>
           )}
           {isPhaseB && (
              <button onClick={lockPhaseB} className="w-full bg-primary text-background py-3 uppercase tracking-widest font-bold mt-4 shadow-glow-red hover:bg-primary/80">
                 Lock Phase B
              </button>
           )}
        </div>
     </div>
  );

  // Fallback map pairs for result display
  const resultPairs = gameState.results?.pairs || [];

  return (
    <div className="w-full font-mono text-textDefault">
      {isLobby && renderLobby()}
      {(isPhaseA || isPhaseA_locked) && !isPhaseB && !isPhaseB_locked && !isReveal && renderActiveA()}
      {isPhaseA_locked && !isPhaseB && !isPhaseB_locked && !isReveal && renderActiveB()}
      {(isPhaseB || isPhaseB_locked) && !isReveal && renderActiveB()}
      
      {isReveal && (
         <div className="space-y-4 border border-border p-4 bg-surface">
            <h3 className="text-sm text-secondary uppercase tracking-widest font-bold border-b border-border pb-2">Sequence Match Results</h3>
            <div className="max-h-64 overflow-y-auto space-y-2">
               {resultPairs.map((pair: any, i: number) => {
                  const pA = players.find(p => p.id === pair.playerAId);
                  const pB = players.find(p => p.id === pair.playerBId);
                  return (
                     <div key={i} className="flex justify-between border-b border-border/50 py-2 text-xs">
                        <div className={`w-1/2 text-left ${pair.winnerId === pair.playerAId ? 'text-green-400 font-bold' : pair.loserId === pair.playerAId ? 'text-red-500 opacity-60' : 'text-amber-500'}`}>
                           {pA?.name || pair.playerAId} — Score: {pair.playerA_score ?? '?'}
                        </div>
                        <div className={`w-1/2 text-right ${pair.winnerId === pair.playerBId ? 'text-green-400 font-bold' : pair.loserId === pair.playerBId ? 'text-red-500 opacity-60' : 'text-amber-500'}`}>
                           Score: {pair.playerB_score ?? '?'} — {pB?.name || pair.playerBId}
                        </div>
                     </div>
                  );
               })}
            </div>
            {onUpdateGameState && (
               <button onClick={() => onUpdateGameState({ gameSpecificConfig: { ...gsc, revealStep: (gsc.revealStep || 0) + 1} })} className="w-full bg-secondary/20 text-secondary border border-secondary py-3 uppercase tracking-widest shadow-glow-gold hover:bg-secondary hover:text-black">
                  ▶ Advance Projector Reveal ({gsc.revealStep || 0}/4)
               </button>
            )}
         </div>
      )}
    </div>
  );
}
