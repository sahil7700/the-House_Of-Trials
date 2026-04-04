"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { subscribeToGameState, subscribeToEventConfig, GameState, EventConfig, GamePhase } from "@/lib/services/game-service";
import { updateGameState, startTimer, confirmEliminations, emergencyPauseToggle } from "@/lib/services/admin-service";
import { collection, onSnapshot, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PlayerData } from "@/lib/services/player-service";

const PHASES: GamePhase[] = ["lobby", "active", "locked", "calculating", "reveal", "confirm", "standby"];

export default function AdminDashboard() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [eventConfig, setEventConfig] = useState<EventConfig | null>(null);
  const [players, setPlayers] = useState<PlayerData[]>([]);
  const [calculating, setCalculating] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/admin");
      return;
    }
    
    const unsubGame = subscribeToGameState(setGameState);
    const unsubConfig = subscribeToEventConfig(setEventConfig);
    
    const playersQuery = query(collection(db, "players"));
    const unsubPlayers = onSnapshot(playersQuery, (snapshot) => {
      const p = snapshot.docs.map(d => d.data() as PlayerData);
      setPlayers(p);
    });

    return () => {
      unsubGame();
      unsubConfig();
      unsubPlayers();
    };
  }, [user, authLoading, router]);

  if (authLoading) return <div className="p-8 font-mono text-textMuted bg-background min-h-screen">Verifying identity...</div>;

  if (!gameState || !eventConfig) {
    return (
      <div className="p-8 font-mono text-textDefault bg-background min-h-screen flex flex-col items-center justify-center space-y-6 bg-scanlines relative">
        <div className="z-10 text-center flex flex-col items-center space-y-6">
          <p className="text-xl text-primary animate-pulse tracking-widest uppercase">System Uninitialized</p>
          <p className="text-sm text-textMuted max-w-sm">
            Event configuration is missing or invalid. Please configure the games in the Game Builder first.
          </p>
          <button 
            onClick={() => router.push("/admin/builder")}
            className="px-6 py-3 bg-primary/20 text-primary border border-primary hover:bg-primary hover:text-white transition-colors tracking-widest uppercase shadow-glow-red"
          >
            Go to Game Builder
          </button>
        </div>
      </div>
    );
  }

  const currentSlotConfig = eventConfig.slots.find(s => s.slotNumber === gameState.currentSlot);
  
  const totalAlive = players.filter(p => p.status === "alive").length;
  const submissionsCount = players.filter(p => p.currentSubmission !== null && p.status === "alive").length;

  const setPhase = (phase: GamePhase) => updateGameState({ phase });

  const handleCalculateResult = async () => {
    setCalculating(true);
    setPhase("calculating");
    try {
      const { runGenericCalculator } = await import("@/app/api/game/calculate/calculators");
      const { getDocs, query, collection, where } = await import("firebase/firestore");
      
      if (!currentSlotConfig) {
        throw new Error("Invalid slot config");
      }

      // Fetch all submissions for current slot
      const q = query(collection(db, "submissions"), where("slotNumber", "==", gameState.currentSlot));
      const querySnapshot = await getDocs(q);
      
      const submissions = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Run Dynamic Calculator
      const { results, eliminatedPlayerIds } = runGenericCalculator(submissions, currentSlotConfig);

      // Update GameState with results
      await updateGameState({
        results: { ...results, eliminatedPlayerIds },
        phase: "reveal"
      });
      
    } catch (e: any) {
      console.error("Calculate Error:", e);
      alert("Failed to calculate: " + e.message);
    }
    setCalculating(false);
  };

  const handleConfirmElimination = async () => {
    if (!gameState.results?.eliminatedPlayerIds) return;
    if (confirm(`Confirm elimination of ${gameState.results.eliminatedPlayerIds.length} players?`)) {
      await confirmEliminations(gameState.results.eliminatedPlayerIds);
      setPhase("standby");
    }
  };

  const advanceToNextSlot = () => {
    const nextSlotIndex = gameState.currentSlot;
    if (nextSlotIndex >= eventConfig.slots.length) {
      alert("End of event sequence!");
      return;
    }
    const nextSlot = eventConfig.slots[nextSlotIndex];
    updateGameState({
      currentSlot: nextSlot.slotNumber,
      currentGameId: nextSlot.gameId,
      phase: "lobby",
      results: null,
      displayMessage: null
    });
  };

  return (
    <main className="min-h-screen bg-background text-textDefault flex flex-col font-mono">
      <header className="bg-surface border-b border-border p-4 flex justify-between items-center z-10 sticky top-0">
        <div>
          <h1 className="font-serif text-2xl tracking-widest uppercase text-textDefault">Live Control Room</h1>
          <p className="text-xs text-secondary tracking-widest mt-1">
            {eventConfig.eventName} • Slot {gameState.currentSlot} / {eventConfig.totalSlots}
          </p>
        </div>
        
        <div className="flex gap-8 text-center text-sm">
          <div>
            <p className="text-textMuted text-xs tracking-widest mb-1">Alive / Total</p>
            <p className="text-xl text-textDefault">{totalAlive} / {players.length}</p>
          </div>
          <div>
            <p className="text-textMuted text-xs tracking-widest mb-1">Phase</p>
            <p className="text-xl text-primary font-bold animate-pulse uppercase">{gameState.phase}</p>
          </div>
        </div>

        <button 
          onClick={() => emergencyPauseToggle(gameState.emergencyPause)}
          className={`${gameState.emergencyPause ? 'bg-primary text-white' : 'bg-primary/20 hover:bg-primary/50 text-primary'} border border-primary px-4 py-2 uppercase text-xs font-bold transition-colors shadow-glow-red`}
        >
          {gameState.emergencyPause ? "RESUME EVENT" : "EMERGENCY PAUSE"}
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        
        <aside className="w-64 border-r border-border bg-surface/50 p-4 space-y-2 overflow-y-auto hidden md:block">
          <p className="text-textMuted uppercase tracking-widest border-b border-border pb-2 mb-4 text-xs">Sequence</p>
          {eventConfig.slots.map(s => {
            const isPast = s.slotNumber < gameState.currentSlot;
            const isCurrent = s.slotNumber === gameState.currentSlot;
            return (
              <div key={s.slotNumber} className={`p-3 border text-xs leading-relaxed ${isCurrent ? 'bg-secondary/20 border-secondary text-secondary shadow-glow-gold' : isPast ? 'bg-primary/10 border-primary/50 text-textMuted/50' : 'bg-background border-border text-textMuted'}`}>
                <div className="uppercase tracking-widest font-bold">Slot {s.slotNumber}</div>
                <div className="truncate">{s.gameName}</div>
              </div>
            );
          })}
        </aside>

        <div className="flex-1 p-6 overflow-auto bg-scanlines relative">
          <div className="w-full max-w-5xl mx-auto space-y-8 relative z-10 border border-border bg-background p-8 shadow-2xl">
              
              <h2 className="font-serif text-3xl tracking-widest uppercase text-primary border-b border-border pb-4 drop-shadow-glow-red">
                {currentSlotConfig?.gameName}
              </h2>

              <div className="flex gap-2 w-full text-[10px] sm:text-xs">
                {PHASES.map((p, i) => {
                  const isActive = gameState.phase === p;
                  return (
                    <div key={p} className={`flex-1 border p-2 text-center uppercase tracking-widest ${isActive ? 'bg-secondary text-background font-bold' : 'bg-surface border-border text-textMuted'}`}>
                      {i + 1}. {p}
                    </div>
                  );
                })}
              </div>

              <section className="bg-surface border border-border p-6 min-h-[200px]">
                {gameState.phase === "lobby" && (
                  <div className="flex flex-col items-center justify-center space-y-6 h-full p-4">
                    <p className="text-sm text-textMuted text-center">Players are currently in the Waiting Lobby.<br/>Ready to start {currentSlotConfig?.gameName}?</p>
                    <button 
                       onClick={() => {
                          setPhase("active");
                          startTimer(currentSlotConfig?.config.timerSeconds || 60);
                       }}
                       className="bg-primary/20 border border-primary text-primary hover:bg-primary hover:text-white px-8 py-3 tracking-widest uppercase transition-colors shadow-glow-red"
                    >
                      START GAME TIMER
                    </button>
                  </div>
                )}
                
                {gameState.phase === "active" && (
                  <div className="flex flex-col items-center space-y-6">
                    <div className="flex w-full justify-between items-end border-b border-border pb-4">
                       <div>
                         <p className="text-secondary text-xs uppercase tracking-widest mb-1">Submissions Received</p>
                         <p className="text-3xl">{submissionsCount} <span className="text-sm text-textMuted">/ {totalAlive} alive</span></p>
                       </div>
                       <button onClick={() => setPhase("locked")} className="bg-surface border border-border hover:bg-border px-6 py-2 tracking-widest uppercase transition-colors">
                          Force Lock Submissions
                       </button>
                    </div>
                    <div className="w-full bg-background h-6 border border-border relative overflow-hidden">
                       <div 
                         className="absolute left-0 top-0 bottom-0 bg-secondary transition-all duration-500" 
                         style={{ width: `${totalAlive > 0 ? (submissionsCount / totalAlive) * 100 : 0}%` }}
                       />
                    </div>
                  </div>
                )}
                
                {gameState.phase === "locked" && (
                  <div className="flex flex-col items-center justify-center space-y-6 h-full p-4">
                    <p className="text-sm text-textMuted text-center">Input is locked. {submissionsCount} submissions captured.</p>
                    <button 
                       onClick={handleCalculateResult} disabled={calculating}
                       className="bg-surface border border-border border-l-4 border-l-secondary px-8 py-3 tracking-widest uppercase transition-colors hover:bg-white/5"
                    >
                      {calculating ? "Processing logic..." : "RUN CALCULATION LOGIC"}
                    </button>
                  </div>
                )}

                {gameState.phase === "calculating" && (
                  <div className="flex flex-col items-center justify-center h-full text-secondary animate-pulse text-sm tracking-widest uppercase">
                    Crunching Data Server-Side...
                  </div>
                )}

                {gameState.phase === "reveal" && (
                   <div className="space-y-6">
                      <p className="text-sm text-textMuted text-center">Calculations Complete. Reveal results to the Big Screen and Player phones?</p>
                      
                      <div className="bg-background border border-border p-4 text-sm grid grid-cols-3 gap-4">
                        <div className="col-span-3 text-center border-b border-border pb-2 text-xs uppercase text-secondary">Result Snapshot</div>
                        <div className="text-center">
                          <p className="text-textMuted text-[10px] uppercase">Eliminations Pending</p>
                          <p className="text-primary text-xl font-bold">{gameState.results?.eliminatedPlayerIds?.length || 0}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-textMuted text-[10px] uppercase">Average Driven</p>
                          <p className="text-xl">{gameState.results?.average?.toFixed(2) ?? "N/A"}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-textMuted text-[10px] uppercase">Target Hit</p>
                          <p className="text-xl text-secondary">{gameState.results?.target?.toFixed(2) ?? "N/A"}</p>
                        </div>
                      </div>

                      <div className="flex gap-4 justify-center">
                        <button onClick={() => setPhase("confirm")} className="bg-primary/20 border border-primary text-primary hover:bg-primary hover:text-white px-8 py-3 tracking-widest uppercase transition-colors shadow-glow-red">
                          Proceed to Confirmation
                        </button>
                      </div>
                   </div>
                )}

                {gameState.phase === "confirm" && (
                  <div className="flex flex-col items-center justify-center space-y-6 h-full p-4 text-center">
                    <p className="text-primary tracking-widest uppercase">DANGER ZONE</p>
                    <p className="text-sm text-textMuted max-w-sm">By pressing confirm, {gameState.results?.eliminatedPlayerIds?.length || 0} players will be permanently marked as eliminated. This cannot be undone automatically.</p>
                    <button 
                       onClick={handleConfirmElimination}
                       className="bg-primary text-white border border-primary font-bold px-8 py-3 tracking-widest uppercase transition-colors shadow-glow-red"
                    >
                      EXECUTE ELIMINATIONS
                    </button>
                  </div>
                )}
                
                {gameState.phase === "standby" && (
                   <div className="flex flex-col items-center justify-center space-y-6 h-full p-4">
                     <p className="text-sm text-textMuted text-center">Round Completed.</p>
                     <button onClick={advanceToNextSlot} className="bg-secondary/20 border border-secondary text-secondary hover:bg-secondary hover:text-background px-8 py-3 tracking-widest uppercase transition-colors shadow-glow-gold">
                       Advance Sequence to Slot {gameState.currentSlot + 1}
                     </button>
                   </div>
                )}
              </section>

              <section className="space-y-4 pt-4">
                 <h3 className="text-sm text-textMuted tracking-widest uppercase">Active Player Roster Feed</h3>
                 <div className="overflow-x-auto border border-border">
                   <table className="w-full text-left text-xs bg-surface/50">
                     <thead className="bg-surface border-b border-border text-textMuted uppercase tracking-widest">
                       <tr>
                         <th className="p-3">ID</th>
                         <th className="p-3">Name</th>
                         <th className="p-3">Status</th>
                         <th className="p-3">Score/Pts</th>
                         <th className="p-3">Current Input</th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-border/50">
                       {players.sort((a,b) => {
                         if (a.status === 'eliminated' && b.status !== 'eliminated') return 1;
                         if (b.status === 'eliminated' && a.status !== 'eliminated') return -1;
                         return 0;
                       }).map(p => (
                         <tr key={p.id} className="hover:bg-surface transition-colors">
                           <td className="p-3 text-secondary font-bold">{p.playerId}</td>
                           <td className="p-3">{p.name}</td>
                           <td className="p-3">
                             <span className={`${p.status === 'eliminated' ? 'text-primary' : 'text-success'} uppercase tracking-widest`}>
                               {p.status}
                             </span>
                           </td>
                           <td className="p-3">{p.points || 0}</td>
                           <td className="p-3">
                             {typeof p.currentSubmission === 'object' ? JSON.stringify(p.currentSubmission) : p.currentSubmission ?? "—"}
                           </td>
                         </tr>
                       ))}
                     </tbody>
                   </table>
                 </div>
              </section>

          </div>
        </div>

      </div>
    </main>
  );
}
