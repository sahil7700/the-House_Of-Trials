"use client";

import { useEffect, useState, useRef } from "react";
import { subscribeToGameState, subscribeToEventConfig, GameState, EventConfig } from "@/lib/services/game-service";
import { collection, onSnapshot, query, doc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PlayerData } from "@/lib/services/player-service";
import { motion, AnimatePresence } from "framer-motion";

export default function ProjectorClient() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [eventConfig, setEventConfig] = useState<EventConfig | null>(null);
  const [playersAlive, setPlayersAlive] = useState(0);
  const [submissionsCount, setSubmissionsCount] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [pairsData, setPairsData] = useState<any[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubGame = subscribeToGameState(setGameState);
    const unsubConfig = subscribeToEventConfig(setEventConfig);
    const unsubPlayers = onSnapshot(query(collection(db, "players")), (snap) => {
      const all = snap.docs.map(d => d.data() as PlayerData);
      setPlayersAlive(all.filter(p => p.status === "alive").length);
      setSubmissionsCount(all.filter(p => p.status === "alive" && p.currentSubmission !== null).length);
    });

    return () => {
      unsubGame();
      unsubConfig();
      unsubPlayers();
    };
  }, []);

  useEffect(() => {
    if (!gameState?.currentSlot) return;
    // Subscribe to legacy pairs collection
    const unsubLegacy = onSnapshot(doc(db, "pairs", String(gameState.currentSlot)), (docSnap) => {
      if (docSnap.exists()) {
        setPairsData(docSnap.data().pairs || []);
      }
    });
    // Also subscribe to new sequencePairs collection for C9
    const unsubSeq = onSnapshot(
      query(collection(db, "sequencePairs"), where("slotNumber", "==", gameState.currentSlot)),
      (snap) => {
        if (!snap.empty) {
          const pairs = snap.docs.map(d => ({ pairId: d.id, ...d.data() }));
          setPairsData(pairs);
        }
      }
    );
    return () => { unsubLegacy(); unsubSeq(); };
  }, [gameState?.currentSlot]);

  useEffect(() => {
    if (!gameState || !["active", "active_a", "active_b"].includes(gameState.phase) || !gameState.timerStartedAt) {
      setTimeLeft(null);
      return;
    }
    const interval = setInterval(() => {
      const now = new Date().getTime();
      const start = gameState.timerStartedAt.toDate().getTime();
      const diff = Math.floor((now - start) / 1000);
      const remaining = Math.max(0, gameState.timerDuration - diff);
      setTimeLeft(remaining);
      if (remaining === 0) clearInterval(interval);
    }, 500);

    return () => clearInterval(interval);
  }, [gameState]);

  useEffect(() => {
    // Wake Lock
    let wakeLock: any = null;
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await (navigator as any).wakeLock.request('screen');
        }
      } catch (err) {}
    };
    requestWakeLock();
    return () => {
      if (wakeLock !== null) wakeLock.release();
    };
  }, []);

  useEffect(() => {
    // Basic offline detection for amber border
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      try {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      } catch (err) {
        console.log("Fullscreen not supported or blocked");
      }
    }
  };

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  if (!gameState || !eventConfig) {
    return <div className="min-h-screen bg-black flex items-center justify-center font-mono text-white text-xl uppercase tracking-widest">Awaiting System Connection...</div>;
  }

  const activeGameId = gameState.currentGameId;
  const gsc = gameState.gameSpecificConfig || {};
  const currentSlotConfig = eventConfig.slots.find(s => s.slotNumber === gameState.currentSlot);
  const revealStep = gsc.revealStep || 0;

  // Projector Phase Logic
  const isLobby = gameState.phase === "lobby" || gameState.phase === "standby" || gameState.phase === "game_over";
  const isOpen = ["active", "active_a", "active_b"].includes(gameState.phase);
  const isLocked = ["locked", "locked_a", "locked_b", "calculating"].includes(gameState.phase);
  const isReveal = gameState.phase === "reveal" || gameState.phase === "confirm";

  const renderContent = () => {
    if (gameState.projectorPush) {
      // If admin pushed a specific card
      return (
        <div className="flex flex-col items-center justify-center h-full space-y-12 animate-fade-in z-20">
           <h2 className="text-8xl font-serif text-secondary tracking-widest uppercase">{gameState.projectorPush.type}</h2>
           <p className="text-4xl text-white font-mono tracking-widest opacity-80">{gameState.projectorPush.content}</p>
        </div>
      );
    }

    if (isLobby) {
      return (
        <div className="flex flex-col items-center justify-center h-full space-y-8 md:space-y-12 animate-fade-in z-20 px-4 text-center">
           <div className="text-secondary text-7xl md:text-[100px] lg:text-[120px] mb-4 md:mb-8 animate-pulse drop-shadow-glow">
              <SuitCycler />
           </div>
           <h1 className="text-5xl md:text-7xl lg:text-[100px] font-serif text-white tracking-[0.2em] uppercase leading-none drop-shadow-glow">House of Trials</h1>
           <p className="text-xl md:text-3xl text-textMuted uppercase tracking-widest font-mono">
             {gameState.phase === "game_over" ? "TOURNAMENT CONCLUDED" : `${gameState.currentRoundTitle || currentSlotConfig?.gameName || "Preparing"} — Stand By`}
           </p>
        </div>
      );
    }

    if (isOpen) {
      if (activeGameId === "B8") {
        const queue: string[] = gsc.queue || [];
        const publicFeed: any[] = gsc.publicFeed || [];
        const currentTurnIndex: number = gsc.currentTurnIndex || 0;

        return (
          <div className="flex flex-col items-center justify-center h-[90%] space-y-12 animate-fade-in z-20 w-[90%] mt-8">
             <h2 className="text-[64px] font-serif text-white tracking-widest uppercase text-center leading-tight">
               Information Cascade
             </h2>
             <p className="text-3xl font-mono text-textMuted uppercase tracking-widest animate-pulse">
               {currentTurnIndex < queue.length ? `Player ${currentTurnIndex + 1} is deciding...` : "Queue Finished"}
             </p>
             <div className="w-full flex-1 border-4 border-border bg-surface p-8 flex flex-wrap gap-4 items-start content-start overflow-hidden relative">
                <AnimatePresence>
                   {publicFeed.map((f, i) => (
                      <motion.div 
                        initial={{ scale: 0, opacity: 0 }} 
                        animate={{ scale: 1, opacity: 1 }} 
                        key={i} 
                        className={`transition-all ${queue.length > 80 ? 'w-8 h-8 sm:w-10 sm:h-10' : 'w-16 h-16 sm:w-24 sm:h-24'} ${f.choice === 'RED' ? 'bg-primary shadow-glow-red' : 'bg-blue-500 shadow-glow-blue'}`} 
                      />
                   ))}
                   {currentTurnIndex < queue.length && (
                      <motion.div 
                        initial={{ opacity: 0 }} 
                        animate={{ opacity: 1 }} 
                        key="deciding" 
                        className={`transition-all border-4 border-dashed border-textMuted animate-pulse ${queue.length > 80 ? 'w-8 h-8 sm:w-10 sm:h-10 border-2' : 'w-16 h-16 sm:w-24 sm:h-24'}`} 
                      />
                   )}
                </AnimatePresence>
             </div>
          </div>
        );
      }
      
      if (activeGameId === "C10") {
        const sequence: number[] = gsc.numberSequence || [];
        const currentIndex: number = gsc.currentNumberIndex || 0;
        const currentNumber = currentIndex > 0 && currentIndex <= sequence.length ? sequence[currentIndex - 1] : null;

        return (
          <div className="flex flex-col items-center justify-center h-[90%] space-y-12 animate-fade-in z-20 w-[90%] mt-8">
             <h2 className="text-[64px] font-serif text-white tracking-widest uppercase text-center leading-tight">
               Peak Finder
             </h2>
             
             <div className="flex flex-col items-center space-y-4">
                <p className="text-3xl font-mono text-textMuted uppercase tracking-widest">
                  Position {currentIndex} / 20
                </p>
                {currentNumber !== null ? (
                  <motion.div 
                    key={currentIndex}
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className={`text-[180px] font-mono font-bold leading-none drop-shadow-glow ${currentNumber >= 70 ? 'text-secondary' : currentNumber >= 34 ? 'text-textDefault' : 'text-primary'}`}
                  >
                    {currentNumber}
                  </motion.div>
                ) : (
                  <div className="text-[180px] font-mono font-bold leading-none text-textMuted opacity-20">—</div>
                )}
             </div>

             <div className="w-full bg-surface border-4 border-border p-8">
                <div className="grid grid-cols-10 gap-2">
                   {sequence.map((n, i) => (
                      <div key={i} className={`flex flex-col items-center justify-center aspect-square border-2 text-2xl font-mono transition-all duration-500
                        ${i < currentIndex ? 'border-border text-textMuted bg-background/50' : 'border-border/30 text-textMuted/20 bg-surface/30'}
                        ${i === currentIndex - 1 ? 'border-primary shadow-glow-red scale-110 z-10 bg-primary/10' : ''}
                        ${i >= 7 && i <= 11 ? 'bg-secondary/5' : ''}
                      `}>
                        {i < currentIndex ? n : '—'}
                        <span className="text-xs text-textMuted/40 mt-1">{i+1}</span>
                      </div>
                   ))}
                </div>
             </div>
             
             <div className="text-xl text-textMuted font-mono uppercase tracking-[0.3em] animate-pulse">
                {currentIndex < 20 ? "Watch for your target number" : "All numbers revealed"}
             </div>
          </div>
        );
      }

      return (
        <div className="flex flex-col items-center justify-center h-full space-y-8 md:space-y-16 animate-fade-in z-20 w-[90%] md:w-3/4">
           <h2 className="text-4xl md:text-6xl lg:text-[80px] font-serif text-white tracking-widest uppercase text-center leading-tight">
             {activeGameId === "C9" && gameState.phase === "active_a" ? "Step 1: Create your secret sequence" :
              activeGameId === "C9" && gameState.phase === "active_b" ? "Step 2: Guess your opponent's sequence" :
              gameState.currentRoundTitle || "Submit Your Decision"}
           </h2>
           
           {timeLeft !== null && (
             <div className="text-[120px] md:text-[200px] font-mono font-bold leading-none tracking-widest text-primary drop-shadow-glow-red">
               {timeLeft < 10 ? `0${timeLeft}` : timeLeft}
             </div>
           )}

           <div className="w-full space-y-4">
             <div className="flex justify-between items-end">
                <span className="text-xl text-textMuted font-mono uppercase tracking-widest">
                   {submissionsCount} / {playersAlive} Received
                </span>
                <span className="text-xl text-secondary font-mono uppercase tracking-widest animate-pulse">
                   Submit on your device
                </span>
             </div>
             <div className="w-full bg-surface border-4 border-border h-6 overflow-hidden">
                <motion.div 
                   className="h-full bg-secondary"
                   initial={{ width: 0 }}
                   animate={{ width: `${playersAlive > 0 ? (submissionsCount / playersAlive) * 100 : 0}%` }}
                   transition={{ duration: 0.5 }}
                />
             </div>
           </div>
        </div>
      );
    }

    if (isLocked) {
      return (
        <div className="flex flex-col items-center justify-center h-full space-y-8 md:space-y-12 animate-fade-in z-20 px-4 text-center">
           <h2 className="text-5xl md:text-[80px] lg:text-[100px] font-serif text-white tracking-widest uppercase drop-shadow-glow">
             {gameState.currentRoundTitle || "All submissions received."}
           </h2>
           <p className="text-2xl md:text-4xl text-textMuted uppercase tracking-widest font-mono pt-4 md:pt-8">Calculating results</p>
           <div className="flex gap-4 pt-8 md:pt-12">
              <div className="w-6 h-6 bg-secondary rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
              <div className="w-6 h-6 bg-secondary rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
              <div className="w-6 h-6 bg-secondary rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
           </div>
        </div>
      );
    }

    if (isReveal) {
      // ------------------------------------
      // GAME B6: BIDDING SURVIVAL
      // ------------------------------------
      if (activeGameId === "B6" && gameState.results?.histogram) {
        const { histogram, cutOffBid, highestBid } = gameState.results;
        const bars = Object.entries(histogram)
           .map(([val, count]) => ({ val: parseInt(val), count: count as number }))
           .filter(b => b.count > 0)
           .sort((a, b) => a.val - b.val);
        const maxCount = Math.max(...bars.map(b => b.count), 1);

        return (
          <div className="w-[90%] h-[80%] flex flex-col items-center z-20 space-y-12 pt-20">
            <h2 className="text-[64px] font-serif text-white tracking-widest uppercase">
               How the house bid
            </h2>
            <div className="w-full flex-1 bg-surface border-4 border-border p-8 flex items-end gap-2 relative overflow-hidden">
               {revealStep >= 1 && bars.map((b, i) => {
                  const isBelowCutoff = b.val <= cutOffBid;
                  const isHighBid = b.val === highestBid;
                  let bgColor = "bg-white/30";
                  
                  if (revealStep >= 2 && isBelowCutoff) bgColor = "bg-primary";
                  else if (revealStep >= 3 && isHighBid) bgColor = "bg-secondary shadow-glow-gold";

                  return (
                    <motion.div 
                      key={b.val}
                      initial={{ height: 0 }}
                      animate={{ height: `${(b.count / maxCount) * 100}%` }}
                      transition={{ duration: 1.5, delay: i * 0.05 }}
                      className={`flex-1 min-w-[8px] relative ${bgColor}`}
                    />
                  );
               })}
               
               {revealStep >= 2 && (
                  <>
                     <div className="absolute top-0 bottom-0 border-l-4 border-primary border-dashed z-0 opacity-70" 
                          style={{ left: `${(cutOffBid / 100) * 100}%` }} />
                     <div className="absolute inset-y-0 left-0 bg-primary/20 z-0" 
                          style={{ width: `${(cutOffBid / 100) * 100}%` }} />
                  </>
               )}
            </div>
            
            <div className="h-32">
               {revealStep >= 2 && revealStep < 3 && (
                  <h3 className="text-5xl font-mono text-primary uppercase tracking-widest font-bold">
                    Bids below {cutOffBid} coins — ELIMINATED
                  </h3>
               )}
               {revealStep >= 3 && (
                  <h3 className="text-5xl font-mono text-secondary uppercase tracking-widest font-bold">
                    Highest bid: {highestBid} coins — SURVIVED WITH PENALTY
                  </h3>
               )}
            </div>
          </div>
        );
      }

      // ------------------------------------
      // GAME C9: SEQUENCE MATCH
      // ------------------------------------
      if (activeGameId === "C9" && revealStep >= 4 && pairsData.length > 0) {
        return (
          <div className="w-[90%] h-[90%] flex flex-col items-center z-20 space-y-8 pt-12">
            <h2 className="text-[64px] font-serif text-white tracking-widest uppercase mb-4">Pair Results</h2>
            <div className="grid grid-cols-3 xl:grid-cols-4 gap-6 w-full max-h-full overflow-hidden content-start">
               {pairsData.map((pair, idx) => {
                  const isATie = pair.tied;
                  const aWon = pair.winnerId === pair.playerAId;
                  const bWon = pair.winnerId === pair.playerBId;

                  return (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.5, delay: idx * 0.1 }}
                      key={idx} 
                      className="border-2 border-border bg-surface p-4 flex flex-col gap-4 text-center font-mono"
                    >
                       <div className="flex justify-between items-center text-xl">
                          <span className={`truncate w-[120px] text-left ${aWon ? 'text-secondary font-bold' : isATie ? 'text-textDefault' : 'text-primary/70 line-through'}`}>{pair.playerAName}</span>
                          <span className="text-sm text-textMuted px-2">vs</span>
                          <span className={`truncate w-[120px] text-right ${bWon ? 'text-secondary font-bold' : isATie ? 'text-textDefault' : 'text-primary/70 line-through'}`}>{pair.playerBName || "BYE"}</span>
                       </div>
                       <div className="flex justify-between items-center text-2xl font-bold bg-background p-2 border border-border">
                          <span className={aWon ? 'text-secondary' : isATie ? 'text-textDefault' : 'text-primary'}>{pair.playerA_score}</span>
                          <span className="text-[10px] text-textMuted uppercase tracking-widest">Score</span>
                          <span className={bWon ? 'text-secondary' : isATie ? 'text-textDefault' : 'text-primary'}>{pair.playerB_score ?? '—'}</span>
                       </div>
                    </motion.div>
                  );
               })}
            </div>
          </div>
        );
      }

      // ------------------------------------
      // GAME B8: INFORMATION CASCADE
      // ------------------------------------
      if (activeGameId === "B8" && gameState.results) {
        const feed = gameState.results.feed || [];
        const trueMajority = gameState.results.trueMajority;

        return (
          <div className="flex flex-col items-center justify-center h-[90%] space-y-12 animate-fade-in z-20 w-[90%] pt-12">
             <h2 className="text-[64px] font-serif text-white tracking-widest uppercase">The True Majority Was</h2>
             <h3 className={`text-[120px] font-bold tracking-widest leading-none ${trueMajority === 'RED' ? 'text-primary drop-shadow-glow-red' : 'text-blue-500 drop-shadow-glow-blue'}`}>
               {trueMajority}
             </h3>
             <div className="w-full flex-1 border-4 border-border bg-surface p-8 flex flex-wrap gap-4 items-start content-start overflow-hidden relative">
                {feed.map((f: any, i: number) => {
                   const correct = f.choice === trueMajority;
                   return (
                      <motion.div 
                        initial={{ opacity: 0 }} 
                        animate={{ opacity: correct ? 1 : 0.3 }} 
                        transition={{ delay: i * 0.05 }}
                        key={i} 
                        className={`flex items-center justify-center font-mono font-bold transition-all
                          ${feed.length > 80 ? 'w-10 h-10 text-xl' : 'w-16 h-16 sm:w-20 sm:h-20 text-3xl'}
                          ${f.choice === 'RED' ? 'bg-primary' : 'bg-blue-500'} 
                          ${correct ? (f.choice === 'RED' ? 'shadow-glow-red' : 'shadow-glow-blue') : 'grayscale'}
                        `} 
                      >
                         {!correct && <span className={`text-white opacity-50 ${feed.length > 80 ? 'text-2xl' : 'text-5xl'}`}>+</span>}
                      </motion.div>
                   );
                })}
             </div>
          </div>
        );
      }

      // ------------------------------------
      // GAME C10: PEAK FINDER REVEAL
      // ------------------------------------
      if (activeGameId === "C10" && gameState.results) {
        const { peakNumber, peakPosition, surviveCount } = gameState.results;
        return (
          <div className="flex flex-col items-center justify-center h-full space-y-12 animate-fade-in z-20 w-[90%]">
             <h2 className="text-[64px] font-serif text-white tracking-widest uppercase">The Sequence Result</h2>
             <div className="flex gap-24">
                <div className="text-center">
                   <p className="text-2xl text-textMuted uppercase mb-4">Peak Number</p>
                   <p className="text-9xl text-secondary drop-shadow-glow-gold font-mono font-bold">{peakNumber}</p>
                </div>
                <div className="text-center">
                   <p className="text-2xl text-textMuted uppercase mb-4">At Position</p>
                   <p className="text-9xl text-white font-mono font-bold">{peakPosition + 1}</p>
                </div>
             </div>
             <div className="pt-12 text-center">
                <p className="text-4xl text-textDefault uppercase tracking-widest font-mono">
                   {surviveCount} Players Survived
                </p>
                <p className="text-xl text-textMuted mt-4 uppercase tracking-[0.4em]">
                   Verdicts updated on individual devices
                </p>
             </div>
          </div>
        );
      }

      // Generic Reveal state
      return (
        <div className="flex flex-col items-center justify-center h-full space-y-12 animate-fade-in z-20">
           <h2 className="text-[100px] font-serif text-white tracking-widest uppercase drop-shadow-glow text-center">
             Results Calculated
           </h2>
           <p className="text-4xl text-textMuted uppercase tracking-widest font-mono pt-8 animate-pulse text-center">
             Check your device for personal verdict
           </p>
        </div>
      );
    }

    // =============================================
    // C9 SEQUENCE MATCH PROJECTOR
    // =============================================
    if ((gameState as any).phase === "phase_a_open") {
      const seqPhaseAStartedAt = (gameState as any).sequencePhaseAStartedAt;
      const phaseASeconds = (gameState as any).sequenceConfig?.phaseASeconds || 120;
      const start = seqPhaseAStartedAt?.toDate?.()?.getTime() || Date.now();
      const remaining = Math.max(0, phaseASeconds - Math.floor((Date.now() - start) / 1000));
      const m = Math.floor(remaining / 60);
      const s = remaining % 60;

      return (
        <div className="flex flex-col items-center justify-center h-full space-y-8 animate-fade-in z-20 text-center px-4">
           <h1 className="text-[80px] font-serif text-white uppercase tracking-widest">Step 1: Create Your Secret Sequence</h1>
           <p className={`text-[160px] font-mono font-bold leading-none ${remaining <= 30 ? "text-primary animate-pulse" : "text-white"}`}>
             {m}:{s.toString().padStart(2, "0")}
           </p>
           <p className="text-2xl text-textMuted font-mono uppercase tracking-widest">
             {submissionsCount} / {playersAlive} sequences sealed
           </p>
        </div>
      );
    }

    if ((gameState as any).phase === "phase_b_open") {
      const seqPhaseBStartedAt = (gameState as any).sequencePhaseBStartedAt;
      const phaseBSeconds = (gameState as any).sequenceConfig?.phaseBSeconds || 90;
      const start = seqPhaseBStartedAt?.toDate?.()?.getTime() || Date.now();
      const remaining = Math.max(0, phaseBSeconds - Math.floor((Date.now() - start) / 1000));
      const m = Math.floor(remaining / 60);
      const s = remaining % 60;

      return (
        <div className="flex flex-col items-center justify-center h-full space-y-8 animate-fade-in z-20 text-center px-4">
           <h1 className="text-[80px] font-serif text-amber-500 uppercase tracking-widest drop-shadow-glow-gold">Step 2: Guess Opponent Sequence</h1>
           <p className={`text-[160px] font-mono font-bold leading-none ${remaining <= 30 ? "text-primary animate-pulse" : "text-amber-500"}`}>
             {m}:{s.toString().padStart(2, "0")}
           </p>
           <p className="text-2xl text-textMuted font-mono uppercase tracking-widest">
             {submissionsCount} / {playersAlive} guesses locked
           </p>
        </div>
      );
    }

    if ((gameState as any).phase === "phase_b_locked") {
      return (
        <div className="flex flex-col items-center justify-center h-full space-y-8 animate-fade-in z-20 text-center px-4">
           <h1 className="text-[80px] font-serif text-secondary uppercase tracking-widest">All Guesses Locked</h1>
           <p className="text-3xl text-textMuted font-mono uppercase tracking-widest animate-pulse">Calculating results...</p>
        </div>
      );
    }

    // C9 Reveal (with pair results from sequencePairs collection)
    if ((gameState as any).phase === "reveal" && activeGameId === "C9") {
      const c9RevealStep: number = (gameState as any).sequenceRevealStep || 0;
      const elimIds: string[] = (gameState as any).pendingEliminations || [];
      const results: any = (gameState as any).results || {};

      return (
        <div className="flex flex-col items-center justify-center h-full space-y-8 animate-fade-in z-20 text-center px-4">
           <h1 className="text-[80px] font-serif text-secondary uppercase tracking-widest">Sequence Match Results</h1>
           {c9RevealStep === 0 && (
             <p className="text-3xl text-textMuted font-mono uppercase tracking-widest animate-pulse">Calculating...</p>
           )}
           {c9RevealStep >= 1 && (
             <div className="space-y-4">
               <p className="text-4xl text-white font-mono uppercase tracking-widest">
                 {results.eliminatedPlayerIds?.length || 0} Eliminated
               </p>
               <p className="text-2xl text-textMuted font-mono uppercase tracking-widest">
                 {playersAlive} Survivors
               </p>
             </div>
           )}
        </div>
      );
    }

    // =============================================
    // B8 INFORMATION CASCADE PROJECTOR
    // =============================================
    if ((gameState as any).phase === "image_flash") {
      const flashStartedAt = (gameState as any).imageFlashStartedAt;
      const flashSecs = (gameState as any).b8Config?.imageFlashSeconds || 3;
      const start = flashStartedAt?.toDate?.()?.getTime() || Date.now();
      const remaining = Math.max(0, flashSecs - Math.floor((Date.now() - start) / 1000));

      return (
        <div className="flex flex-col items-center justify-center h-full space-y-8 animate-fade-in z-20 text-center px-4">
           <h1 className="text-[80px] font-serif text-white uppercase tracking-widest">Observe</h1>
           <p className="text-2xl text-textMuted font-mono uppercase tracking-widest mb-8">Study the image carefully</p>
           <div className="w-full max-w-2xl aspect-video bg-surface border-4 border-secondary flex items-center justify-center">
              <p className="text-4xl text-secondary font-serif uppercase tracking-widest">
                {((gameState as any).b8Config?.optionALabel || "Option A")} vs {((gameState as any).b8Config?.optionBLabel || "Option B")}
              </p>
           </div>
           <div className="w-full max-w-2xl h-4 bg-background border-2 border-border overflow-hidden">
              <motion.div
                className="h-full bg-secondary"
                animate={{ width: `${(remaining / flashSecs) * 100}%` }}
                transition={{ duration: 0.5 }}
              />
           </div>
           <p className={`text-[120px] font-mono font-bold ${remaining <= 1 ? "text-primary animate-pulse" : "text-white"}`}>{remaining}s</p>
        </div>
      );
    }

    if ((gameState as any).phase === "voting_open") {
      const votingStartedAt = (gameState as any).votingStartedAt;
      const votingSecs = (gameState as any).b8Config?.votingSeconds || 7;
      const start = votingStartedAt?.toDate?.()?.getTime() || Date.now();
      const remaining = Math.max(0, votingSecs - Math.floor((Date.now() - start) / 1000));
      const fakeEnabled = (gameState as any).b8Config?.fakeMajorityEnabled !== false;
      const fakeBias = (gameState as any).b8Config?.fakeMajorityBiasToward || "A";
      const fakePct = (gameState as any).b8Config?.fakeMajorityStartPercent || 72;
      const fakeA = fakeBias === "A" ? fakePct : 100 - fakePct;
      const fakeB = fakeBias === "B" ? fakePct : 100 - fakePct;

      return (
        <div className="flex flex-col items-center justify-center h-full space-y-8 animate-fade-in z-20 text-center px-4">
           <h1 className="text-[80px] font-serif text-white uppercase tracking-widest">Vote Now</h1>
           {fakeEnabled && (
             <div className="w-full max-w-3xl space-y-4">
               <div className="space-y-2">
                 <div className="flex justify-between text-2xl font-mono">
                   <span className="text-primary">{((gameState as any).b8Config?.optionALabel || "Option A")}</span>
                   <span className="text-primary font-bold">{fakeA}%</span>
                 </div>
                 <div className="w-full h-12 bg-background border-2 border-border overflow-hidden">
                   <motion.div className="h-full bg-primary" animate={{ width: `${fakeA}%` }} transition={{ duration: 0.5 }} />
                 </div>
               </div>
               <div className="space-y-2">
                 <div className="flex justify-between text-2xl font-mono">
                   <span className="text-blue-400">{((gameState as any).b8Config?.optionBLabel || "Option B")}</span>
                   <span className="text-blue-400 font-bold">{fakeB}%</span>
                 </div>
                 <div className="w-full h-12 bg-background border-2 border-border overflow-hidden">
                   <motion.div className="h-full bg-blue-500" animate={{ width: `${fakeB}%` }} transition={{ duration: 0.5 }} />
                 </div>
               </div>
             </div>
           )}
           <p className={`text-[120px] font-mono font-bold ${remaining <= 3 ? "text-primary animate-pulse" : "text-white"}`}>{remaining}s</p>
           <p className="text-2xl text-textMuted font-mono uppercase tracking-widest">Submit your vote on your device</p>
        </div>
      );
    }

    if ((gameState as any).phase === "voting_locked") {
      return (
        <div className="flex flex-col items-center justify-center h-full space-y-8 animate-fade-in z-20 text-center px-4">
           <h1 className="text-[80px] font-serif text-secondary uppercase tracking-widest">Voting Closed</h1>
           <p className="text-3xl text-textMuted font-mono uppercase tracking-widest animate-pulse">Results being calculated...</p>
        </div>
      );
    }

    if ((gameState as any).phase === "confidence") {
      const confStartedAt = (gameState as any).confidenceStartedAt;
      const confSecs = (gameState as any).b8Config?.confidenceSeconds || 5;
      const start = confStartedAt?.toDate?.()?.getTime() || Date.now();
      const remaining = Math.max(0, confSecs - Math.floor((Date.now() - start) / 1000));

      return (
        <div className="flex flex-col items-center justify-center h-full space-y-8 animate-fade-in z-20 text-center px-4">
           <h1 className="text-[80px] font-serif text-amber-500 uppercase tracking-widest">Confidence Ratings</h1>
           <p className={`text-[120px] font-mono font-bold text-amber-500`}>{remaining}s</p>
           <p className="text-2xl text-textMuted font-mono uppercase tracking-widest">Rate your certainty on your device</p>
        </div>
      );
    }

    if ((gameState as any).phase === "confidence_locked") {
      return (
        <div className="flex flex-col items-center justify-center h-full space-y-8 animate-fade-in z-20 text-center px-4">
           <h1 className="text-[80px] font-serif text-secondary uppercase tracking-widest">Results Ready</h1>
           <p className="text-3xl text-textMuted font-mono uppercase tracking-widest animate-pulse">Reveal coming...</p>
        </div>
      );
    }

    // B8 Reveal
    if ((gameState as any).phase === "reveal" && activeGameId === "B8") {
      const b8Results: any = (gameState as any).b8Results;
      const b8RevealStep: number = (gameState as any).b8RevealStep || 0;

      return (
        <div className="flex flex-col items-center justify-center h-full space-y-8 animate-fade-in z-20 text-center px-4">
           {b8RevealStep === 0 && (
             <p className="text-3xl text-textMuted font-mono uppercase tracking-widest animate-pulse">Preparing results...</p>
           )}
           {b8RevealStep >= 1 && b8Results && (
             <div className="space-y-8">
               <h1 className="text-[80px] font-serif text-secondary uppercase tracking-widest">Correct Answer</h1>
               <p className={`text-[120px] font-mono font-bold ${b8Results.correctAnswer === "A" ? "text-primary" : "text-blue-400"}`}>
                 {b8Results.correctAnswer}
               </p>
             </div>
           )}
           {b8RevealStep >= 2 && b8Results && (
             <div className="space-y-4">
               <p className="text-4xl text-white font-mono uppercase tracking-widest">Vote Split</p>
               <div className="flex w-full max-w-3xl h-16 overflow-hidden border-2 border-border">
                 <div className="h-full bg-primary" style={{ width: `${(b8Results.votesA / Math.max(b8Results.totalVoters, 1)) * 100}%` }} />
                 <div className="h-full bg-blue-500" style={{ width: `${(b8Results.votesB / Math.max(b8Results.totalVoters, 1)) * 100}%` }} />
               </div>
               <div className="flex justify-between text-2xl font-mono">
                 <span className="text-primary">A: {b8Results.votesA}</span>
                 <span className="text-blue-400">B: {b8Results.votesB}</span>
               </div>
             </div>
           )}
           {b8RevealStep >= 3 && b8Results && (
             <div className="space-y-4">
               <p className="text-4xl text-textMuted font-mono uppercase tracking-widest">Eliminated: {b8Results.eliminatedCount}</p>
               {b8Results.overconfidentCount > 0 && (
                 <p className="text-2xl text-amber-500 font-mono uppercase tracking-widest">Overconfident: {b8Results.overconfidentCount}</p>
               )}
             </div>
           )}
        </div>
      );
    }

    // =============================================
    // LEMONS PHASE PROJECTOR
    // =============================================
    if ((gameState as any).phase === "roles_assigned") {
      const sellers = (gameState as any).marketRoles?.sellers || [];
      const buyers = (gameState as any).marketRoles?.buyers || [];
      return (
        <div className="flex flex-col items-center justify-center h-full space-y-8 animate-fade-in z-20 text-center px-4">
           <h1 className="text-[80px] font-serif text-secondary uppercase tracking-widest drop-shadow-glow">Market of Lemons</h1>
           <p className="text-3xl text-white font-mono uppercase tracking-widest">{sellers.length} Sellers · {buyers.length} Buyers</p>
           <p className="text-2xl text-textMuted font-mono uppercase tracking-widest animate-pulse">Preparing card reveal...</p>
        </div>
      );
    }

    if ((gameState as any).phase === "card_flash") {
      const sellers = (gameState as any).marketRoles?.sellers || [];
      return (
        <div className="flex flex-col items-center justify-center h-full space-y-8 animate-fade-in z-20 text-center px-4">
           <h1 className="text-[80px] font-serif text-secondary uppercase tracking-widest">Sellers — View Your Card</h1>
           <p className="text-2xl text-white font-mono uppercase tracking-widest">Buyers — Stand by</p>
        </div>
      );
    }

    if ((gameState as any).phase === "trading_open") {
      const tradingStartedAt = (gameState as any).tradingStartedAt;
      const tradingSecs = (gameState as any).marketConfig?.tradingSeconds || 300;
      const start = tradingStartedAt?.toDate?.()?.getTime() || Date.now();
      const elapsed = (Date.now() - start) / 1000;
      const remaining = Math.max(0, tradingSecs - elapsed);
      const m = Math.floor(remaining / 60);
      const s = Math.floor(remaining % 60);
      const timeStr = `${m}:${s.toString().padStart(2, "0")}`;

      return (
        <div className="flex flex-col items-center justify-center h-full space-y-8 animate-fade-in z-20 text-center px-4">
           <h1 className="text-[80px] font-serif text-primary uppercase tracking-widest drop-shadow-glow-red">Trading Is Open</h1>
           <p className={`text-[160px] font-mono font-bold leading-none ${remaining <= 30 ? "text-primary animate-pulse" : "text-primary"}`}>
             {timeStr}
           </p>
        </div>
      );
    }

    if ((gameState as any).phase === "trading_locked") {
      return (
        <div className="flex flex-col items-center justify-center h-full space-y-8 animate-fade-in z-20 text-center px-4">
           <h1 className="text-[80px] font-serif text-secondary uppercase tracking-widest">Trading Has Ended</h1>
           <p className="text-2xl text-textMuted font-mono uppercase tracking-widest animate-pulse">Preparing the reveal...</p>
        </div>
      );
    }

    if ((gameState as any).phase === "reveal") {
      const revealStep = (gameState as any).revealStep || 0;
      const marketRoles: any = (gameState as any).marketRoles || {};
      const results: any[] = (gameState as any).results || [];
      const sellers = marketRoles.sellers || [];

      if (revealStep === 0) {
        return (
          <div className="flex flex-col items-center justify-center h-full space-y-8 animate-fade-in z-20 text-center">
             <h1 className="text-[80px] font-serif text-secondary uppercase tracking-widest">Preparing Results...</h1>
             <div className="w-16 h-16 border-4 border-secondary border-t-transparent rounded-full animate-spin" />
          </div>
        );
      }

      return (
        <div className="flex flex-col items-center justify-center h-full space-y-8 animate-fade-in z-20 text-center px-4">
           <h1 className="text-[80px] font-serif text-secondary uppercase tracking-widest">Market of Lemons</h1>
           <p className="text-2xl text-textMuted font-mono uppercase tracking-widest">Results complete — check your device</p>
           <p className="text-xl text-primary font-mono uppercase tracking-widest">{results.filter((r: any) => r.outcome === "eliminated").length} eliminated · {results.filter((r: any) => r.outcome !== "eliminated").length} survived</p>
        </div>
      );
    }

    return null;
  };

  return (
    <main className={`min-h-screen bg-black overflow-hidden relative cursor-none flex flex-col ${isOffline ? 'border-8 border-yellow-600' : ''}`}>
      {!isFullscreen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
           <button onClick={toggleFullscreen} className="px-12 py-6 border-4 border-white text-white text-4xl font-serif uppercase tracking-widest hover:bg-white hover:text-black transition-colors">
              Tap to enter Fullscreen
           </button>
        </div>
      )}

      {/* Ambient background animation */}
      <div className="absolute inset-0 z-0 opacity-10 pointer-events-none overflow-hidden flex flex-wrap justify-center items-center">
         <BackgroundRunes />
      </div>

      {renderContent()}

      {/* Persistent Bottom Bar */}
      <div className="absolute bottom-0 left-0 right-0 h-24 bg-surface/50 border-t-2 border-border/50 flex justify-between items-center px-12 z-40 backdrop-blur-sm">
         <span className="text-secondary text-2xl font-serif uppercase tracking-[0.2em] drop-shadow-glow-gold">House of Trials</span>
         <span className="text-white text-3xl font-mono uppercase tracking-widest">{gameState.currentRoundTitle || currentSlotConfig?.gameName || ""}</span>
         <span className="text-textMuted text-2xl font-mono uppercase tracking-widest">Players alive: <span className="text-white font-bold">{playersAlive}</span></span>
      </div>
    </main>
  );
}

// Helper components
function SuitCycler() {
  const [idx, setIdx] = useState(0);
  const suits = ["♠", "♣", "♦", "♥"];
  useEffect(() => {
    const i = setInterval(() => setIdx(v => (v + 1) % 4), 4000);
    return () => clearInterval(i);
  }, []);
  return <span>{suits[idx]}</span>;
}

function BackgroundRunes() {
  return (
    <div className="relative w-full h-full flex items-center justify-evenly text-[20vw] text-[#4a0000] font-serif font-bold animate-pulse" style={{ animationDuration: '8s' }}>
       <span className="opacity-50 blur-sm">♣</span>
       <span className="opacity-30 blur-md translate-y-20">♠</span>
       <span className="opacity-50 blur-sm -translate-y-20">♦</span>
       <span className="opacity-30 blur-md">♥</span>
    </div>
  );
}
