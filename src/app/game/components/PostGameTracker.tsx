import { GameState } from "@/lib/services/game-service";
import { PlayerData } from "@/lib/services/player-service";
import { motion } from "framer-motion";

interface Props {
  gameState: GameState;
  player: PlayerData;
}

export default function PostGameTracker({ gameState, player }: Props) {
  const isEliminatedThisRound = gameState.results?.eliminatedPlayerIds?.includes(player.id);
  const isAliveAndWell = player.status === "alive" && !isEliminatedThisRound;
  
  // Calculate potential round points
  const pointsDeltaMap = gameState.results?.pointsDeltaMap || {};
  const currentDelta = pointsDeltaMap[player.id];
  
  // N/A fallback for generic games
  const deltaString = currentDelta !== undefined 
    ? (currentDelta >= 0 ? `+${currentDelta}` : `${currentDelta}`)
    : 'N/A';

  const newTotal = currentDelta !== undefined ? player.points + currentDelta : player.points;

  return (
    <div className="w-full max-w-lg mx-auto flex flex-col items-center justify-center p-6 min-h-[50vh] animate-fade-in font-mono">
      <h2 className="text-sm font-bold uppercase tracking-widest text-textMuted mb-2 text-center">Round Complete</h2>
      <h3 className="text-2xl text-secondary font-serif mb-8 text-center uppercase tracking-widest">{gameState.currentRoundTitle}</h3>

      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }} 
        animate={{ scale: 1, opacity: 1 }} 
        transition={{ delay: 0.5, type: "spring" }}
        className={`w-full p-8 border text-center space-y-6 ${
            isEliminatedThisRound 
              ? "bg-red-900/20 border-primary text-primary shadow-glow-red" 
              : "bg-surface border-secondary text-secondary shadow-glow-gold"
        }`}
      >
        <p className="text-sm tracking-widest uppercase opacity-70">Round Verdict</p>
        <p className={`text-5xl font-bold uppercase ${isEliminatedThisRound ? "text-primary drop-shadow-[0_0_15px_rgba(255,0,0,0.5)]" : "text-white"}`}>
          {isEliminatedThisRound ? "Eliminated" : "Survived"}
        </p>
        
        <div className="pt-6 border-t border-border mt-6 grid grid-cols-2 gap-4 divide-x divide-border opacity-90">
             <div className="text-center space-y-1">
                 <p className="text-[10px] uppercase tracking-widest text-textMuted">Points Earned</p>
                 <p className={`text-xl font-bold ${currentDelta !== undefined && currentDelta < 0 ? 'text-primary' : 'text-green-400'}`}>
                    {deltaString}
                 </p>
             </div>
             <div className="text-center space-y-1 pl-4">
                 <p className="text-[10px] uppercase tracking-widest text-textMuted">New Cumalative</p>
                 <p className="text-xl font-bold text-white uppercase">{newTotal}</p>
             </div>
        </div>
      </motion.div>

      {isEliminatedThisRound && (
         <p className="text-xs text-primary/75 mt-8 max-w-sm text-center uppercase tracking-widest">
            Your journey ends here. Await final confirmation.
         </p>
      )}

      {isAliveAndWell && (
         <p className="text-xs text-textMuted mt-8 max-w-sm text-center uppercase tracking-widest">
            Stand by for the administrator to finalize results.
         </p>
      )}
    </div>
  );
}
