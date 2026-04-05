import { useState, useEffect } from "react";
import { GameState } from "@/lib/services/game-service";
import { PlayerData } from "@/lib/services/player-service";

interface Props {
  gameState: GameState;
  players: PlayerData[];
  onUpdateGameState?: (update: Partial<GameState>) => void;
}

export default function GameB8Admin({ gameState, players, onUpdateGameState }: Props) {
  const [redBias, setRedBias] = useState(70);
  const alivePlayers = players.filter(p => p.status === "alive");

  const gsc = (gameState as any).gameSpecificConfig || {};
  const queue: string[] = gsc.queue || [];
  const signals: Record<string, string> = gsc.signals || {};
  const publicFeed: any[] = gsc.publicFeed || [];
  const currentTurnIndex: number = gsc.currentTurnIndex || 0;
  const trueMajority: string = gsc.trueMajority || "UNKNOWN";
  
  // 1. Pre-game initialisation
  const handleGenerateGame = () => {
    if (!onUpdateGameState) return;

    // Shuffle players for the queue
    const shuffled = [...alivePlayers].sort(() => Math.random() - 0.5);
    const newQueue = shuffled.map(p => p.id);

    // Assign signals based on bias
    const newSignals: Record<string, string> = {};
    let redCount = 0;
    
    shuffled.forEach(p => {
      const isRed = (Math.random() * 100) < redBias;
      if (isRed) redCount++;
      newSignals[p.id] = isRed ? "RED" : "BLUE";
    });

    // True majority is just whatever we decided is the bias majority, 
    // OR we can make it rigorously the actual mathematical majority of the signals.
    // The game's narrative: "Based on the biased distribution..." 
    // Let's use the actual count of generated signals, or the bias intent.
    // Making it the actual count guarantees there's a strict mathematical truth.
    const actualMajority = redCount > (shuffled.length / 2) ? "RED" : "BLUE";

    onUpdateGameState({
      gameSpecificConfig: {
        ...gsc,
        queue: newQueue,
        signals: newSignals,
        trueMajority: actualMajority,
        bias: redBias,
        publicFeed: [],
        currentTurnIndex: 0
      }
    });
  };

  // 2. Orchestration Loop
  // Monitors if the current player has submitted, or if the time has expired.
  useEffect(() => {
    if (gameState.phase !== "active" || queue.length === 0 || !onUpdateGameState) return;

    if (currentTurnIndex >= queue.length) {
      // Queue finished
      onUpdateGameState({ phase: "locked" });
      return;
    }

    const currentActivePlayerId = queue[currentTurnIndex];
    const playerDoc = alivePlayers.find(p => p.id === currentActivePlayerId);

    // Did they submit?
    if (playerDoc && playerDoc.currentSubmission !== null && playerDoc.currentSubmission !== undefined) {
      // Yes, advance the queue
      const choice = playerDoc.currentSubmission;
      
      const newFeed = [...publicFeed, { playerId: currentActivePlayerId, playerName: playerDoc.name, choice }];

      import("firebase/firestore").then(({ serverTimestamp }) => {
         onUpdateGameState({
            gameSpecificConfig: {
               ...gsc,
               publicFeed: newFeed,
               currentTurnIndex: currentTurnIndex + 1
            },
            timerStartedAt: serverTimestamp() // Reset timer for the next player
         } as any);
      });
    }

  }, [gameState.phase, queue, currentTurnIndex, alivePlayers, publicFeed, gsc, onUpdateGameState]);

  // Display rendering
  const isLobby = gameState.phase === "lobby" || gameState.phase === "locked" && currentTurnIndex === 0;
  
  if (isLobby) {
    return (
       <div className="w-full space-y-4 border border-secondary bg-secondary/5 p-4 text-center">
          <h3 className="text-secondary font-bold uppercase tracking-widest text-sm">Cascade Configuration</h3>
          
          <div className="flex justify-center items-center gap-4 py-4">
             <span className="text-primary font-bold">RED Bias: {redBias}%</span>
             <input type="range" min="10" max="90" step="5" value={redBias} onChange={e => setRedBias(parseInt(e.target.value))} className="w-48 accent-secondary" />
             <span className="text-blue-500 font-bold">BLUE Bias: {100 - redBias}%</span>
          </div>

          <button onClick={handleGenerateGame} className="bg-secondary text-background px-6 py-2 uppercase font-bold tracking-widest text-xs hover:bg-white transition-colors">
            Generate Signals & Queue
          </button>

          {queue.length > 0 && (
             <p className="text-xs text-textMuted uppercase tracking-widest mt-4">✓ Initialized. True Majority: {trueMajority}</p>
          )}
       </div>
    );
  }

  // Active or Post-Active Monitor
  return (
    <div className="w-full space-y-4">
       <div className="border border-border bg-surface p-4 grid grid-cols-3 gap-4 text-center">
          <div><p className="text-[10px] text-textMuted uppercase mb-1">True Majority</p><p className={`text-xl font-bold ${trueMajority === 'RED' ? 'text-primary' : 'text-blue-500'}`}>{trueMajority}</p></div>
          <div><p className="text-[10px] text-textMuted uppercase mb-1">Current Turn</p><p className="text-xl font-mono">{currentTurnIndex} / {queue.length}</p></div>
          <div><p className="text-[10px] text-textMuted uppercase mb-1">Status</p><p className="text-sm font-bold uppercase mt-1">{currentTurnIndex >= queue.length ? 'Queue Finished' : 'Waiting for Input'}</p></div>
       </div>

       <div className="border border-border bg-surface p-4 font-mono text-xs max-h-60 overflow-y-auto">
          <p className="uppercase tracking-widest text-textMuted mb-2">Live Public Feed ({publicFeed.length})</p>
          <div className="space-y-1">
             {publicFeed.map((f, i) => (
                <div key={i} className="flex justify-between items-center p-2 border border-border bg-background">
                   <span className="text-textMuted">#{i+1} {f.playerName}</span>
                   <span className={`font-bold ${f.choice === 'RED' ? 'text-primary' : 'text-blue-500'}`}>{f.choice}</span>
                </div>
             ))}
             {currentTurnIndex < queue.length && (
                <div className="flex justify-between items-center p-2 border border-secondary border-dashed bg-secondary/10 text-secondary animate-pulse">
                   <span>#{currentTurnIndex + 1} {alivePlayers.find(p => p.id === queue[currentTurnIndex])?.name || queue[currentTurnIndex]}</span>
                   <span>Deciding...</span>
                </div>
             )}
          </div>
       </div>
    </div>
  );
}
