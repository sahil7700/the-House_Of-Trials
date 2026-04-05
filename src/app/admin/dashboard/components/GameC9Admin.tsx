import { useState, useEffect } from "react";
import { GameState } from "@/lib/services/game-service";
import { PlayerData } from "@/lib/services/player-service";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface Props {
  gameState: GameState;
  players: PlayerData[];
  onUpdateGameState?: (update: Partial<GameState>) => void;
}

export default function GameC9Admin({ gameState, players, onUpdateGameState }: Props) {
  const [pairsData, setPairsData] = useState<any[]>([]);
  const alivePlayers = players.filter(p => p.status === "alive");

  useEffect(() => {
    if (!gameState.currentSlot) return;
    const unsub = onSnapshot(doc(db, "pairs", String(gameState.currentSlot)), (docSnap) => {
      if (docSnap.exists()) {
        setPairsData(docSnap.data().pairs || []);
      } else {
        setPairsData([]);
      }
    });
    return () => unsub();
  }, [gameState.currentSlot]);

  const handlePairPlayers = async () => {
    if (!confirm("This will overwrite any existing pairings for this slot. Continue?")) return;
    
    // Shuffle players
    const shuffled = [...alivePlayers].sort(() => Math.random() - 0.5);
    const newPairs: any[] = [];
    
    for (let i = 0; i < shuffled.length; i += 2) {
      const p1 = shuffled[i];
      const p2 = shuffled[i + 1];
      
      newPairs.push({
        pairId: `pair_${i}`,
        playerAId: p1.id,
        playerAName: p1.name,
        playerBId: p2 ? p2.id : null,
        playerBName: p2 ? p2.name : null,
        playerA_sequence: null,
        playerB_sequence: null,
        playerA_guess: null,
        playerB_guess: null,
        playerA_score: null,
        playerB_score: null,
        winnerId: null,
        loserId: null,
        tied: false
      });
    }

    try {
      await setDoc(doc(db, "pairs", String(gameState.currentSlot)), {
        slotNumber: gameState.currentSlot,
        pairs: newPairs
      });
      if (onUpdateGameState) onUpdateGameState({ pairingComplete: true });
    } catch (e) {
      console.error(e);
      alert("Failed to save pairs");
    }
  };

  const gsc = (gameState as any).gameSpecificConfig || {};
  const currentRevealStep = gsc.revealStep || 0;
  const isRevealPhase = gameState.phase === "reveal" || gameState.phase === "confirm";
  const isOpA = gameState.phase === "active_a" || gameState.phase === "locked_a";
  const isOpB = gameState.phase === "active_b" || gameState.phase === "locked_b";

  return (
    <div className="w-full space-y-6">
      
      {!gameState.pairingComplete && gameState.phase === "lobby" && (
         <div className="border border-secondary bg-secondary/10 p-6 text-center space-y-4">
            <h3 className="text-secondary font-bold uppercase tracking-widest text-sm">Pre-game Pairing Required</h3>
            <p className="text-xs text-textMuted uppercase tracking-widest">Assign opponents randomly for this slot.</p>
            <button onClick={handlePairPlayers} className="bg-secondary text-background px-6 py-2 uppercase font-bold tracking-widest text-xs hover:bg-white transition-colors">
               Generate Random Pairs
            </button>
         </div>
      )}

      {pairsData.length > 0 && (
         <div className="border border-border bg-surface p-4 text-xs font-mono">
            <p className="text-[10px] text-textMuted uppercase tracking-widest mb-4">Pairing Status ({pairsData.length} pairs)</p>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
               {pairsData.map((pair, idx) => {
                 let aStatusClass = "text-textMuted";
                 let bStatusClass = "text-textMuted";
                 let aStatusText = "waiting";
                 let bStatusText = "waiting";

                 if (isOpA) {
                    if (pair.playerA_sequence) { aStatusClass = "text-secondary font-bold"; aStatusText = "sealed"; }
                    if (pair.playerB_sequence) { bStatusClass = "text-secondary font-bold"; bStatusText = "sealed"; }
                 } else if (isOpB) {
                    if (pair.playerA_guess) { aStatusClass = "text-secondary font-bold"; aStatusText = "guessed"; }
                    if (pair.playerB_guess) { bStatusClass = "text-secondary font-bold"; bStatusText = "guessed"; }
                 } else if (isRevealPhase) {
                    aStatusClass = pair.winnerId === pair.playerAId ? "text-secondary font-bold" : (pair.tied ? "text-primary" : "text-textMuted line-through");
                    bStatusClass = pair.winnerId === pair.playerBId ? "text-secondary font-bold" : (pair.tied ? "text-primary" : "text-textMuted line-through");
                    aStatusText = pair.playerA_score;
                    bStatusText = pair.playerB_score;
                 }

                 return (
                   <div key={idx} className="flex justify-between items-center p-2 border border-border bg-background">
                     <div className={`flex-1 ${aStatusClass}`}>
                        {pair.playerAName} <span className="text-[8px] uppercase">[{aStatusText}]</span>
                     </div>
                     <span className="px-2 text-textMuted text-[10px] font-bold tracking-widest">VS</span>
                     <div className={`flex-1 text-right ${bStatusClass}`}>
                        <span className="text-[8px] uppercase">[{bStatusText}]</span> {pair.playerBName || "BYE"}
                     </div>
                   </div>
                 );
               })}
            </div>
         </div>
      )}

      {isRevealPhase && onUpdateGameState && (
         <div className="border border-secondary/50 bg-secondary/5 p-4 space-y-3 mt-4">
           <p className="text-[10px] text-secondary uppercase tracking-widest font-bold">Reveal Sequence</p>
           <div className="grid grid-cols-2 gap-2 text-xs">
             <button
               onClick={() => onUpdateGameState({ gameSpecificConfig: { ...gsc, revealStep: 0 } } as any)}
               className={`p-2 border uppercase tracking-widest ${currentRevealStep === 0 ? 'bg-secondary text-background border-secondary' : 'border-border text-textMuted'}`}
             >Reset Reveal</button>
             <button
               onClick={() => onUpdateGameState({ gameSpecificConfig: { ...gsc, revealStep: 4 } } as any)}
               className={`p-2 border uppercase tracking-widest ${currentRevealStep === 4 ? 'bg-secondary text-background border-secondary' : 'border-secondary text-secondary font-bold'}`}
             >Reveal All Results</button>
           </div>
         </div>
      )}
    </div>
  );
}
