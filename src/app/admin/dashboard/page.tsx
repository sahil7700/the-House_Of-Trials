"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { subscribeToGameState, GameState } from "@/lib/services/game-service";
import { updateGameState, startTimer, confirmEliminations, emergencyPause } from "@/lib/services/admin-service";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PlayerData } from "@/lib/services/player-service";

export default function AdminDashboard() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [players, setPlayers] = useState<PlayerData[]>([]);
  const [timerInput, setTimerInput] = useState(60);
  const [calculating, setCalculating] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/admin");
      return;
    }
    
    // Subscribe to everything
    const unsubGame = subscribeToGameState(setGameState);
    
    const playersQuery = query(collection(db, "players"));
    const unsubPlayers = onSnapshot(playersQuery, (snapshot) => {
      const p = snapshot.docs.map(d => d.data() as PlayerData);
      setPlayers(p);
      
      // Auto-recalc alive count locally if we want, but doing it on confirm is better
      const alive = p.filter(pl => pl.status === "alive");
      updateGameState({ playersAlive: alive.length, totalPlayers: p.length });
    });

    return () => {
      unsubGame();
      unsubPlayers();
    };
  }, [user, authLoading, router]);

  if (authLoading) return <div className="p-8 font-mono text-textMuted bg-background min-h-screen">Verifying identity...</div>;

  if (!gameState) {
    return (
      <div className="p-8 font-mono text-textDefault bg-background min-h-screen flex flex-col items-center justify-center space-y-6 bg-scanlines relative">
        <div className="z-10 text-center flex flex-col items-center space-y-6">
          <p className="text-xl text-primary animate-pulse tracking-widest uppercase">System Uninitialized</p>
          <p className="text-sm text-textMuted max-w-sm">
            The database collections have not been generated yet. Firestore is schemaless and will generate them automatically once you initialize the system.
          </p>
          <button 
            onClick={async () => {
               const { initializeGameState } = await import("@/lib/services/admin-service");
               await initializeGameState();
            }}
            className="px-6 py-3 bg-primary/20 text-primary border border-primary hover:bg-primary hover:text-white transition-colors tracking-widest uppercase shadow-glow-red"
          >
            Initialize Database
          </button>
        </div>
      </div>
    );
  }

  const totalAlive = players.filter(p => p.status === "alive").length;
  const submissionsCount = players.filter(p => p.currentSubmission !== null && p.status === "alive").length;

  // Actions
  const handleOpenLobby = () => updateGameState({ phase: "lobby", results: null });
  const handleStartGame = () => {
    updateGameState({ phase: "active", currentRound: gameState.currentRound + 1 });
    startTimer(timerInput);
  };
  const handleLockSubmissions = () => updateGameState({ phase: "locked" });
  
  const handleCalculateResult = async () => {
    setCalculating(true);
    try {
      const res = await fetch("/api/game/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: gameState.currentGame })
      });
      const data = await res.json();
      console.log("Calculated Results:", data);
    } catch (e) {
      console.error(e);
    }
    setCalculating(false);
  };

  const handleRevealResult = () => updateGameState({ phase: "reveal" });
  
  const handleConfirmElimination = async () => {
    if (!gameState.results?.eliminatedPlayerIds) return;
    if (confirm(`Eliminate ${gameState.results.eliminatedPlayerIds.length} players?`)) {
      await confirmEliminations(gameState.results.eliminatedPlayerIds);
    }
  };

  const handleNextGame = () => {
    // Ideally clear out player currentSubmission here, we can iterate or use an API route
    // For prototype simplicity, the players would just have their submission overwritten in the next round
    updateGameState({ phase: "standby", displayMessage: "Stand by. Next game preparing.", results: null });
  };

  return (
    <main className="min-h-screen bg-background text-textDefault flex flex-col">
      {/* Top Bar */}
      <header className="bg-surface border-b border-border p-4 flex justify-between items-center z-10 sticky top-0">
        <div>
          <h1 className="font-serif text-2xl tracking-widest uppercase text-textDefault">Control Room</h1>
          <p className="font-mono text-xs text-secondary tracking-widest uppercase mt-1">
            Game {gameState.currentGame} • Round {gameState.currentRound}
          </p>
        </div>
        
        <div className="flex gap-8 text-center font-mono">
          <div>
            <p className="text-textMuted text-xs uppercase tracking-widest">Alive / Total</p>
            <p className="text-xl text-textDefault">{totalAlive} / {players.length}</p>
          </div>
          <div>
            <p className="text-textMuted text-xs uppercase tracking-widest">Global Status</p>
            <p className="text-xl text-primary font-bold animate-pulse uppercase">{gameState.phase}</p>
          </div>
        </div>

        <button 
          onClick={emergencyPause}
          className="bg-primary/20 hover:bg-primary/50 text-primary border border-primary px-4 py-2 font-mono uppercase text-sm font-bold shadow-glow-red transition-colors"
        >
          Emergency Pause
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        
        {/* Left Sidebar - Games */}
        <aside className="w-64 border-r border-border bg-surface/50 p-4 font-mono text-sm space-y-2 hidden md:block">
          <p className="text-textMuted uppercase tracking-widest border-b border-border pb-2 mb-4">Games</p>
          <div className="p-3 bg-primary/10 border border-primary text-primary opacity-50 cursor-not-allowed">1. Dead or Alive (Locked)</div>
          <div className="p-3 bg-secondary/20 border border-secondary text-secondary shadow-glow-gold">2. The Average (Active)</div>
          <div className="p-3 bg-textMuted/10 border border-border text-textMuted opacity-50 cursor-not-allowed">3. Distance (Locked)</div>
          <div className="p-3 bg-textMuted/10 border border-border text-textMuted opacity-50 cursor-not-allowed">4. Survival (Locked)</div>
        </aside>

        {/* Main Panel */}
        <div className="flex-1 p-6 overflow-auto bg-scanlines relative">
          <div className="max-w-4xl mx-auto space-y-8 z-10 relative bg-background/90 p-8 border border-border shadow-2xl">
            
            <h2 className="font-serif text-3xl tracking-widest uppercase text-textDefault border-b border-border pb-4">Game Controls</h2>
            
            {/* Pre-Game Controls */}
            <section className="space-y-4">
              <h3 className="font-mono text-sm text-secondary uppercase tracking-widest">1. Pre-Game</h3>
              <div className="flex gap-4 items-end">
                <div className="space-y-1">
                  <label className="font-mono text-xs text-textMuted">Timer Duration (s)</label>
                  <input 
                    type="number" 
                    value={timerInput}
                    onChange={(e) => setTimerInput(Number(e.target.value))}
                    className="bg-surface border border-border px-3 py-2 text-white font-mono w-32"
                  />
                </div>
                <button onClick={handleOpenLobby} className="bg-surface border border-border hover:bg-border px-6 py-2 font-mono text-sm uppercase transition-colors">
                  Open Lobby
                </button>
                <button onClick={handleStartGame} className="bg-primary/20 border border-primary hover:bg-primary px-6 py-2 font-mono text-sm uppercase transition-colors text-primary hover:text-white">
                  Start Game
                </button>
              </div>
            </section>

            {/* During Game */}
            <section className="space-y-4 pt-4 border-t border-border/50">
              <h3 className="font-mono text-sm text-secondary uppercase tracking-widest">2. In Progress</h3>
              <div className="flex justify-between items-center bg-surface p-4 border border-border">
                <div className="font-mono">
                  <p className="text-textMuted text-xs uppercase tracking-widest mb-1">Submissions</p>
                  <p className="text-xl">{submissionsCount} / {totalAlive}</p>
                </div>
                <div className="w-1/2 bg-background h-4 border border-border relative overflow-hidden">
                   <div 
                     className="absolute left-0 top-0 bottom-0 bg-secondary transition-all duration-500" 
                     style={{ width: `${totalAlive > 0 ? (submissionsCount / totalAlive) * 100 : 0}%` }}
                   />
                </div>
                <button onClick={handleLockSubmissions} className="bg-surface border border-border hover:bg-border px-6 py-2 font-mono text-sm uppercase transition-colors">
                  Lock Submissions
                </button>
              </div>
            </section>

            {/* Post-Game */}
            <section className="space-y-4 pt-4 border-t border-border/50">
               <h3 className="font-mono text-sm text-secondary uppercase tracking-widest">3. Resolution</h3>
               
               <div className="flex flex-wrap gap-4">
                 <button onClick={handleCalculateResult} disabled={calculating} className="bg-surface border border-border hover:bg-border px-4 py-2 font-mono text-sm uppercase transition-colors">
                   {calculating ? "Calculating..." : "Calculate Result"}
                 </button>
                 <button onClick={handleRevealResult} disabled={!gameState.results} className="bg-secondary/20 border border-secondary text-secondary hover:bg-secondary hover:text-surface px-4 py-2 font-mono text-sm uppercase transition-colors">
                   Reveal Display
                 </button>
                 <button onClick={handleConfirmElimination} disabled={!gameState.results} className="bg-primary/20 border border-primary text-primary hover:bg-primary hover:text-surface px-4 py-2 font-mono text-sm uppercase transition-colors shadow-glow-red">
                   Confirm Eliminations
                 </button>
                 <button onClick={handleNextGame} className="bg-surface border border-border hover:bg-border px-4 py-2 font-mono text-sm uppercase transition-colors ml-auto">
                   Next Round (Standby)
                 </button>
               </div>

               {/* Results preview */}
               {gameState.results && (
                 <div className="bg-surface border border-border p-4 font-mono text-sm grid grid-cols-3 gap-4 mt-4">
                   <div>
                     <span className="text-textMuted uppercase tracking-widest block text-xs">Average</span>
                     <span className="text-lg">{gameState.results.average.toFixed(2)}</span>
                   </div>
                   <div>
                     <span className="text-textMuted uppercase tracking-widest block text-xs">Target (2/3)</span>
                     <span className="text-secondary text-lg">{gameState.results.target.toFixed(2)}</span>
                   </div>
                   <div>
                     <span className="text-textMuted uppercase tracking-widest block text-xs">Eliminated Count</span>
                     <span className="text-primary text-lg font-bold">{gameState.results.eliminatedPlayerIds.length}</span>
                   </div>
                 </div>
               )}
            </section>

            {/* Player Table */}
            <section className="space-y-4 pt-8">
              <h3 className="font-serif text-xl text-textDefault tracking-widest uppercase">Live Roster</h3>
              <div className="overflow-x-auto border border-border">
                <table className="w-full text-left font-mono text-sm">
                  <thead className="bg-surface border-b border-border text-textMuted text-xs uppercase tracking-widest">
                    <tr>
                      <th className="p-3">ID</th>
                      <th className="p-3">Name</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Number</th>
                      <th className="p-3">Distance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {players.sort((a,b) => {
                      if (a.status === 'eliminated' && b.status !== 'eliminated') return 1;
                      if (b.status === 'eliminated' && a.status !== 'eliminated') return -1;
                      return 0;
                    }).map(p => {
                      // Calculate distance on the fly if results exist
                      let dist: string | number = "—";
                      if (gameState.results && p.currentSubmission !== null) {
                        dist = Math.abs(p.currentSubmission - gameState.results.target).toFixed(2);
                      }
                      
                      return (
                      <tr key={p.id} className="border-b border-border/50 hover:bg-surface/50 transition-colors">
                        <td className="p-3 text-secondary">{p.playerId}</td>
                        <td className="p-3">{p.name}</td>
                        <td className="p-3">
                          <span className={`${p.status === 'eliminated' ? 'text-primary' : 'text-success'} uppercase text-xs tracking-widest`}>
                            {p.status}
                          </span>
                        </td>
                        <td className="p-3">{p.currentSubmission ?? "—"}</td>
                        <td className="p-3">{dist}</td>
                      </tr>
                    )})}
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
