"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { subscribeToGameState, subscribeToEventConfig, GameState, EventConfig, GamePhase } from "@/lib/services/game-service";
import { updateGameState, startTimer, confirmEliminations, emergencyPauseToggle, finalizeRoundResults, PlayerRoundUpdate, resetToSlotOne } from "@/lib/services/admin-service";
import { collection, onSnapshot, query, doc, writeBatch, getDocs, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PlayerData } from "@/lib/services/player-service";
import AdminGameStats from "./components/AdminGameStats";

const PHASES: GamePhase[] = ["lobby", "active", "locked", "calculating", "reveal", "confirm", "standby"];

export default function AdminDashboard() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [eventConfig, setEventConfig] = useState<EventConfig | null>(null);
  const [players, setPlayers] = useState<PlayerData[]>([]);
  const [calculating, setCalculating] = useState(false);
  const [pendingUpdates, setPendingUpdates] = useState<Record<string, PlayerRoundUpdate>>({});
  
  // Next Round Config Draft
  const [nextGameId, setNextGameId] = useState("A1");
  const [nextGameTitle, setNextGameTitle] = useState("");
  const [nextGameTimer, setNextGameTimer] = useState(60);
  const [nextRoundType, setNextRoundType] = useState<"standard" | "semi-final" | "final">("standard");

  const getGamePlayCount = (id: string) => {
    return gameState?.gameHistory?.[id] || 0;
  };

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

  // Auto-lock when all alive players have submitted
  useEffect(() => {
    if (!gameState || gameState.phase !== "active") return;
    const totalAlive = players.filter(p => p.status === "alive").length;
    const submitted = players.filter(p => p.currentSubmission !== null && p.status === "alive").length;
    if (totalAlive > 0 && submitted >= totalAlive) {
      updateGameState({ phase: "locked" });
    }
  }, [players, gameState]);

  // Sync results to pending updates for orchestration
  useEffect(() => {
    if (gameState?.phase === "reveal" && gameState.results?.eliminatedPlayerIds) {
      const eliminatedIds = gameState.results.eliminatedPlayerIds;
      const fresh: Record<string, PlayerRoundUpdate> = {};
      players.filter(p => p.status === "alive").forEach(p => {
        const isEliminated = eliminatedIds.includes(p.id);
        fresh[p.id] = {
          uid: p.id,
          status: isEliminated ? "eliminated" : "alive",
          pointsDelta: isEliminated ? 0 : 10 // Default 10 pts for survival
        };
      });
      setPendingUpdates(fresh);
    }
  }, [gameState?.phase, players.length]); // Depend on phase and players count

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
      
      if (!currentSlotConfig) {
        throw new Error("Invalid slot config");
      }

      // Build submissions from the already-loaded players state (avoids querying
      // the submissions collection which the admin may not have read access to).
      // We use 'alive' players who have a non-null currentSubmission.
      const submissions = players
        .filter(p => p.status === "alive" && p.currentSubmission !== null && p.currentSubmission !== undefined)
        .map(p => ({
          id: p.id,
          playerId: p.id,
          slotNumber: gameState.currentSlot,
          value: p.currentSubmission
        }));

      if (submissions.length === 0) {
        // No submissions — just move to reveal with empty result
        await updateGameState({ results: { eliminatedPlayerIds: [] }, phase: "reveal" });
        setCalculating(false);
        return;
      }

      // Run Dynamic Calculator
      // For dynamic orchestration, we might not have a formal SlotConfig in the DB.
      // We'll use the one we found, or a default fallback based on the LIVE state.
      const calcConfig = currentSlotConfig || {
        gameId: gameState.currentGameId,
        config: {
          eliminationValue: 1, // default 1 person for A1/A3
          gameSpecificConfig: {}
        }
      };

      const { results, eliminatedPlayerIds } = runGenericCalculator(submissions, calcConfig as any);

      // Update GameState with results
      await updateGameState({
        results: { ...results, eliminatedPlayerIds },
        phase: "reveal"
      });
      
    } catch (e: any) {
      console.error("Calculate Error:", e);
      // Reset phase back to locked so admin can retry
      await updateGameState({ phase: "locked" });
      alert("Failed to calculate: " + e.message);
    }
    setCalculating(false);
  };

  const handleFinalizeResults = async () => {
    const updates = Object.values(pendingUpdates);
    if (updates.length === 0) {
      alert("No updates to process. Ensure calculation was run.");
      return;
    }

    const isFinal = gameState.roundType === "final";
    const msg = isFinal 
      ? "CRITICAL: This is the FINAL ROUND. Finalizing will declare the winner and conclude the tournament. Continue?"
      : `Finalize round and apply points/eliminations for ${updates.length} players?`;

    if (confirm(msg)) {
      setCalculating(true);
      try {
        await finalizeRoundResults(updates, isFinal);
        setPendingUpdates({});
      } catch (e: any) {
        alert("Error finalizing: " + e.message);
      }
      setCalculating(false);
    }
  };

  const syncPendingUpdates = (eliminatedIds: string[]) => {
    const fresh: Record<string, PlayerRoundUpdate> = {};
    players.filter(p => p.status === "alive").forEach(p => {
      const isEliminated = eliminatedIds.includes(p.id);
      fresh[p.id] = {
        uid: p.id,
        status: isEliminated ? "eliminated" : "alive",
        pointsDelta: isEliminated ? 0 : 10 // Default 10 pts for survival
      };
    });
    setPendingUpdates(fresh);
  };



  const toggleElimination = (uid: string) => {
    setPendingUpdates(prev => ({
      ...prev,
      [uid]: {
        ...prev[uid],
        status: prev[uid].status === "alive" ? "eliminated" : "alive"
      }
    }));
  };

  const approveWildCard = async (uid: string) => {
    if (confirm("Approve this wild card player to join the game?")) {
      try {
        await updateDoc(doc(db, "players", uid), { status: "alive" });
      } catch (e: any) {
        alert("Error approving wild card: " + e.message);
      }
    }
  };

  const rejectWildCard = async (uid: string) => {
    if (confirm("Reject this wild card?")) {
      try {
        await updateDoc(doc(db, "players", uid), { status: "eliminated" });
      } catch (e: any) {
        alert("Error rejecting wild card: " + e.message);
      }
    }
  };

  const updatePoints = (uid: string, delta: number) => {
    setPendingUpdates(prev => ({
      ...prev,
      [uid]: {
        ...prev[uid],
        pointsDelta: delta
      }
    }));
  };

  const startDynamicRound = async () => {
    if (!nextGameTitle) {
      alert("Please enter a title for the round.");
      return;
    }
    
    setCalculating(true);
    try {
      const newHistory = { ...(gameState?.gameHistory || {}) };
      newHistory[nextGameId] = (newHistory[nextGameId] || 0) + 1;

      await updateGameState({
        currentGameId: nextGameId,
        currentRoundTitle: nextGameTitle,
        phase: "lobby",
        timerDuration: nextGameTimer,
        roundType: nextRoundType,
        gameHistory: newHistory,
        results: null,
        submissionsCount: 0
      });
      // Clear player submissions
      const snap = await getDocs(collection(db, "players"));
      const batch = writeBatch(db);
      snap.docs.forEach(d => batch.update(d.ref, { currentSubmission: null, submittedAt: null }));
      await batch.commit();
      
      alert(`Round "${nextGameTitle}" started!`);
    } catch (e: any) {
      alert("Error starting round: " + e.message);
    }
    setCalculating(false);
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
      displayMessage: null,
      submissionsCount: 0  // reset for new round
    });
    // Clear currentSubmission on all players for the new round
    import("firebase/firestore").then(({ writeBatch, doc, collection, getDocs }) => {
      import("@/lib/firebase").then(({ db }) => {
        getDocs(collection(db, "players")).then(snap => {
          const batch = writeBatch(db);
          snap.docs.forEach(d => batch.update(d.ref, { currentSubmission: null, submittedAt: null }));
          batch.commit();
        });
      });
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

        <div className="flex gap-2">
          <button
            onClick={() => updateGameState({ wildEntryOpen: !gameState.wildEntryOpen })}
            className={`${gameState.wildEntryOpen ? 'bg-secondary text-background font-bold shadow-glow-gold' : 'bg-secondary/20 hover:bg-secondary/40 text-secondary'} border border-secondary px-4 py-2 uppercase text-xs transition-colors`}
          >
            {gameState.wildEntryOpen ? "⚡ CLOSE WILD ENTRY" : "⚡ OPEN WILD ENTRY"}
          </button>
          <button
            onClick={() => { if(confirm("Reset current slot to 1?")) resetToSlotOne(); }}
            className="bg-surface border border-border px-4 py-2 uppercase text-xs hover:bg-border transition-colors mr-2"
          >
            ↺ RESET SLOT
          </button>
          <button 
            onClick={() => emergencyPauseToggle(gameState.emergencyPause)}
            className={`${gameState.emergencyPause ? 'bg-primary text-white' : 'bg-primary/20 hover:bg-primary/50 text-primary'} border border-primary px-4 py-2 uppercase text-xs font-bold transition-colors shadow-glow-red`}
          >
            {gameState.emergencyPause ? "RESUME EVENT" : "EMERGENCY PAUSE"}
          </button>
        </div>
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
              
              <h2 className="font-serif text-3xl tracking-widest uppercase text-primary border-b border-border pb-4 drop-shadow-glow-red flex justify-between items-center">
                <span>{gameState.currentRoundTitle || currentSlotConfig?.gameName}</span>
                <span className="text-xs text-textMuted font-mono">ID: {gameState.currentGameId}</span>
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
                    <p className="text-sm text-textMuted text-center uppercase tracking-widest">
                       Lobby: {gameState.currentRoundTitle}
                    </p>
                    <button 
                       onClick={() => {
                          updateGameState({ 
                            phase: "active",
                            playersAlive: totalAlive,
                            submissionsCount: 0
                          });
                          startTimer(gameState.timerDuration || 60);
                       }}
                       className="bg-primary/20 border border-primary text-primary hover:bg-primary hover:text-white px-8 py-3 tracking-widest uppercase transition-colors shadow-glow-red"
                    >
                      START ROUND TIMER
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
                     
                     <div className="w-full flex justify-end gap-2">
                         <button 
                             onClick={() => updateGameState({ timerDuration: (gameState.timerDuration || 60) + 30 })}
                             className="text-[10px] uppercase border border-border px-3 py-1 text-textMuted hover:text-secondary hover:border-secondary transition-colors"
                         >
                             +30s Timer
                         </button>
                     </div>

                     <div className="w-full pt-4">
                        <AdminGameStats gameState={gameState} players={players} />
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
                   <div className="space-y-8">
                      <div className="bg-background border border-border p-4 text-sm grid grid-cols-3 gap-4">
                        <div className="col-span-3 text-center border-b border-border pb-2 text-xs uppercase text-secondary">Automation Snapshot</div>
                        <div className="text-center">
                          <p className="text-textMuted text-[10px] uppercase">Suggestion</p>
                          <p className="text-primary text-xl font-bold">{gameState.results?.eliminatedPlayerIds?.length || 0} dead</p>
                        </div>
                        <div className="text-center">
                          <p className="text-textMuted text-[10px] uppercase">Avg/Metric</p>
                          <p className="text-xl">{gameState.results?.average?.toFixed(2) ?? gameState.results?.majorityRange ?? "N/A"}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-textMuted text-[10px] uppercase">Target</p>
                          <p className="text-xl text-secondary">{gameState.results?.target?.toFixed(2) ?? "N/A"}</p>
                        </div>
                      </div>

                      {gameState.currentGameId === "A3" && gameState.results?.pairs && (
                         <div className="space-y-4">
                            <h3 className="text-xs uppercase tracking-widest text-secondary border-b border-secondary pb-2">A3 Pair Results ({gameState.results.pairs.length} pairs)</h3>
                            <div className="overflow-x-auto max-h-[300px] border border-border">
                              <table className="w-full text-[10px] uppercase tracking-tighter">
                                 <thead className="bg-surface text-textMuted">
                                    <tr>
                                       <th className="p-2 text-left">P1 (Bid)</th>
                                       <th className="p-2 text-right">P2 (Bid)</th>
                                       <th className="p-2 text-center">Outcome</th>
                                    </tr>
                                 </thead>
                                 <tbody className="divide-y divide-border">
                                    {gameState.results.pairs.map((pair: any, i: number) => {
                                       const p1Name = players.find(p => p.id === pair.player1Uid)?.name || pair.player1Id;
                                       const p2Name = pair.player2Uid ? (players.find(p => p.id === pair.player2Uid)?.name || pair.player2Id) : "UNMATCHED";
                                       return (
                                         <tr key={i} className="hover:bg-surface/50">
                                            <td className="p-2">
                                              <span className="font-bold text-textDefault">{p1Name}</span> <br/>
                                              <span className="text-secondary">Bid: {pair.val1}</span> | Score: {pair.score1} {pair.p1Bonus ? `(+${pair.p1Bonus})` : ''}
                                            </td>
                                            <td className="p-2 text-right">
                                              <span className="font-bold text-textDefault">{p2Name}</span> <br/>
                                              <span className="text-primary">Bid: {pair.val2 ?? '—'}</span> | Score: {pair.score2 ?? '—'} {pair.p2Bonus ? `(+${pair.p2Bonus})` : ''}
                                            </td>
                                            <td className="p-2 text-center text-textMuted">
                                              {pair.val1 === pair.val2 ? "Tie" : (pair.val2 === null ? "Safe" : (pair.val1 < pair.val2 ? "P1 Won Bonus" : "P2 Won Bonus"))}
                                            </td>
                                         </tr>
                                       );
                                    })}
                                 </tbody>
                              </table>
                            </div>
                         </div>
                      )}

                      <div className="space-y-4">
                        <h3 className="text-xs uppercase tracking-widest text-textMuted border-b border-border pb-2">Manual Override Table</h3>
                        <div className="overflow-x-auto max-h-[400px] border border-border">
                          <table className="w-full text-[10px] uppercase tracking-tighter">
                            <thead className="bg-surface text-textMuted">
                              <tr>
                                <th className="p-2 text-left">Player</th>
                                <th className="p-2">Input</th>
                                <th className="p-2">Points</th>
                                <th className="p-2 text-right">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {players.filter(p => p.status === "alive").map(p => {
                                const update = pendingUpdates[p.id];
                                if (!update) return null;
                                return (
                                  <tr key={p.id} className={update.status === "eliminated" ? "bg-primary/10" : ""}>
                                    <td className="p-2 font-bold">{p.name} <span className="opacity-50 font-normal">({p.playerId})</span></td>
                                    <td className="p-2 text-center text-secondary font-mono">{p.currentSubmission ?? "—"}</td>
                                    <td className="p-2 text-center">
                                      <input 
                                        type="number" 
                                        className="w-12 bg-background border border-border text-center p-1"
                                        value={update.pointsDelta}
                                        onChange={(e) => updatePoints(p.id, parseInt(e.target.value) || 0)}
                                      />
                                    </td>
                                    <td className="p-2 text-right">
                                      <button 
                                        onClick={() => toggleElimination(p.id)}
                                        className={`px-3 py-1 border text-[8px] tracking-widest ${update.status === "eliminated" ? "bg-primary text-white border-primary" : "border-textMuted text-textMuted"}`}
                                      >
                                        {update.status === "eliminated" ? "ELIMINATED" : "KEEP ALIVE"}
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="flex gap-4 justify-center pt-4">
                        <button onClick={handleFinalizeResults} disabled={calculating} className={`border px-8 py-3 tracking-widest uppercase transition-colors shadow-glow-red ${gameState.roundType === 'final' ? 'bg-secondary text-background border-secondary font-bold' : 'bg-primary/20 border-primary text-primary hover:bg-primary hover:text-white'}`}>
                          {calculating ? "Processing Batch..." : (gameState.roundType === 'final' ? "🏆 FINALIZE EVENT & DECLARE WINNER" : "FINALIZE & COMMIT ROUND")}
                        </button>
                      </div>
                   </div>
                )}


                
                {gameState.phase === "standby" && (
                   <div className="flex flex-col items-center space-y-8 h-full p-4">
                     <div className="text-center space-y-2">
                        <h3 className="text-secondary tracking-widest uppercase shadow-glow-gold">Prepare Round {gameState.currentSlot}</h3>
                        <p className="text-[10px] text-textMuted font-mono">Create the next trial on the spot</p>
                     </div>

                     <div className="w-full max-w-md grid grid-cols-2 gap-4 text-xs">
                        <div className="col-span-2 space-y-2">
                          <label className="text-[10px] text-textMuted uppercase tracking-widest">Select Game Type</label>
                          <select 
                            value={nextGameId} 
                            onChange={(e) => setNextGameId(e.target.value)}
                            className="w-full bg-surface border border-border p-3 text-textDefault focus:border-secondary outline-none transition-colors"
                          >
                            <option value="A1">A1: Majority Trap (Numerical) {getGamePlayCount("A1") > 0 ? `[Played ${getGamePlayCount("A1")}]` : ""}</option>
                            <option value="A2">A2: Range Minority {getGamePlayCount("A2") > 0 ? `[Played ${getGamePlayCount("A2")}]` : ""}</option>
                            <option value="A3">A3: Sequential Pair Elimination {getGamePlayCount("A3") > 0 ? `[Played ${getGamePlayCount("A3")}]` : ""}</option>
                            <option value="A4">A4: Weighted Ranking {getGamePlayCount("A4") > 0 ? `[Played ${getGamePlayCount("A4")}]` : ""}</option>
                            <option value="B5">B5: Nashify / Black Hole (Puzzle) {getGamePlayCount("B5") > 0 ? `[Played ${getGamePlayCount("B5")}]` : ""}</option>
                            <option value="B6">B6: Market of Lemons (Physical) {getGamePlayCount("B6") > 0 ? `[Played ${getGamePlayCount("B6")}]` : ""}</option>
                            <option value="B7">B7: Threshold Route Choice {getGamePlayCount("B7") > 0 ? `[Played ${getGamePlayCount("B7")}]` : ""}</option>
                            <option value="B8">B8: Information Cascade (Physical) {getGamePlayCount("B8") > 0 ? `[Played ${getGamePlayCount("B8")}]` : ""}</option>
                            <option value="C9">C9: Pluralistic Silence {getGamePlayCount("C9") > 0 ? `[Played ${getGamePlayCount("C9")}]` : ""}</option>
                            <option value="C10">C10: Top Percentage Elimination {getGamePlayCount("C10") > 0 ? `[Played ${getGamePlayCount("C10")}]` : ""}</option>
                            <option value="OFFLINE">Offline: Manual/Physical Trial {getGamePlayCount("OFFLINE") > 0 ? `[Played ${getGamePlayCount("OFFLINE")}]` : ""}</option>
                          </select>
                        </div>

                        <div className="col-span-2 space-y-2">
                          <label className="text-[10px] text-textMuted uppercase tracking-widest">Custom Round Title</label>
                          <input 
                            type="text"
                            placeholder="e.g. The Hunger Games"
                            value={nextGameTitle}
                            onChange={(e) => setNextGameTitle(e.target.value)}
                            className="w-full bg-surface border border-border p-3 text-textDefault focus:border-secondary outline-none transition-colors"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] text-textMuted uppercase tracking-widest">Round Type</label>
                          <select 
                            value={nextRoundType} 
                            onChange={(e) => setNextRoundType(e.target.value as any)}
                            className="w-full bg-surface border border-border p-3 text-textDefault focus:border-secondary outline-none transition-colors"
                          >
                            <option value="standard">Standard Round</option>
                            <option value="semi-final">Semi-Final</option>
                            <option value="final">Final Round</option>
                          </select>
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] text-textMuted uppercase tracking-widest">Timer (sec)</label>
                          <input 
                            type="number"
                            value={nextGameTimer}
                            onChange={(e) => setNextGameTimer(parseInt(e.target.value) || 0)}
                            className="w-full bg-surface border border-border p-3 text-textDefault focus:border-secondary outline-none transition-colors"
                          />
                        </div>

                        <div className="flex items-end">
                           <button 
                             onClick={startDynamicRound}
                             disabled={calculating}
                             className="w-full bg-secondary/20 border border-secondary text-secondary hover:bg-secondary hover:text-background p-3 tracking-widest uppercase transition-colors shadow-glow-gold font-bold"
                           >
                             {calculating ? "Initializing..." : "START THIS ROUND"}
                           </button>
                        </div>
                     </div>
                   </div>
                )}
              </section>

              <section className="space-y-4 pt-4">
                 <h3 className="text-sm text-textMuted tracking-widest uppercase">Active Player Roster Feed</h3>
                 
                 {/* WILD CARD PROCESSING SECTION */}
                 {players.filter(p => p.status === "waiting" && p.isWildCard).length > 0 && (
                   <div className="mb-8 border border-secondary shadow-glow-gold p-4 bg-secondary/10">
                     <h4 className="text-secondary text-xs tracking-widest uppercase mb-4 animate-pulse">⚡ Pending Wild Card Requests</h4>
                     <table className="w-full text-left text-xs bg-background border border-secondary/50">
                       <thead className="bg-surface text-textMuted uppercase tracking-widest border-b border-secondary/50">
                         <tr>
                            <th className="p-2">Name</th>
                            <th className="p-2">College</th>
                            <th className="p-2">Phone</th>
                            <th className="p-2 text-right">Actions</th>
                         </tr>
                       </thead>
                       <tbody className="divide-y divide-secondary/20">
                         {players.filter(p => p.status === "waiting" && p.isWildCard).map(p => (
                            <tr key={p.id}>
                               <td className="p-2 font-bold text-secondary">{p.name}</td>
                               <td className="p-2">{p.college}</td>
                               <td className="p-2">{p.phone || "—"}</td>
                               <td className="p-2 text-right space-x-2">
                                  <button onClick={() => approveWildCard(p.id)} className="px-3 py-1 bg-secondary text-background font-bold hover:bg-secondary/80">APPROVE</button>
                                  <button onClick={() => rejectWildCard(p.id)} className="px-3 py-1 border border-primary text-primary hover:bg-primary hover:text-white">REJECT</button>
                               </td>
                            </tr>
                         ))}
                       </tbody>
                     </table>
                   </div>
                 )}

                 <div className="overflow-x-auto border border-border">
                   <table className="w-full text-left text-xs bg-surface/50">
                     <thead className="bg-surface border-b border-border text-textMuted uppercase tracking-widest">
                       <tr>
                         <th className="p-3">ID</th>
                         <th className="p-3">Name</th>
                         <th className="p-3">Status</th>
                         <th className="p-3 bg-secondary/10 text-secondary" title="Wild Card Origin">★ WC</th>
                         <th className="p-3">Score/Pts</th>
                         <th className="p-3">Current Input</th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-border/50">
                       {players.sort((a,b) => {
                         // Sort so waiting wild cards are top, then alive, then eliminated
                         if (a.status === 'waiting' && b.status !== 'waiting') return -1;
                         if (b.status === 'waiting' && a.status !== 'waiting') return 1;
                         if (a.status === 'eliminated' && b.status !== 'eliminated') return 1;
                         if (b.status === 'eliminated' && a.status !== 'eliminated') return -1;
                         return 0;
                       }).map(p => (
                         <tr key={p.id} className="hover:bg-surface transition-colors">
                           <td className="p-3 text-secondary font-bold">{p.playerId}</td>
                           <td className="p-3">{p.name}</td>
                           <td className="p-3">
                             <span className={`${p.status === 'eliminated' ? 'text-primary' : p.status === 'waiting' ? 'text-secondary animate-pulse' : 'text-success'} uppercase tracking-widest`}>
                               {p.status}
                             </span>
                           </td>
                           <td className="p-3 text-secondary">{p.isWildCard ? "★" : ""}</td>
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
