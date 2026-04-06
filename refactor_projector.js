const fs = require('fs');

let code = fs.readFileSync('src/app/projector/ProjectorClient.tsx', 'utf8');

// 1. Add playersData state
code = code.replace(
  /const \[playersAlive, setPlayersAlive\] = useState\(0\);/,
  `const [playersAlive, setPlayersAlive] = useState(0);\n  const [playersData, setPlayersData] = useState<PlayerData[]>([]);`
);

// 2. Set playersData inside unsubPlayers
code = code.replace(
  /const unsubPlayers = onSnapshot\(query\(collection\(db, "players"\)\), \(snap\) => \{\s*const all = snap\.docs\.map\(d => d\.data\(\) as PlayerData\);\s*setPlayersAlive\(all\.filter\(p => p\.status === "alive"\)\.length\);\s*setSubmissionsCount\(all\.filter\(p => p\.status === "alive" && p\.currentSubmission !== null\)\.length\);\s*\}\);/,
  `const unsubPlayers = onSnapshot(query(collection(db, "players")), (snap) => {
      const all = snap.docs.map(d => d.data() as PlayerData);
      setPlayersData(all);
      setPlayersAlive(all.filter(p => p.status === "alive").length);
      setSubmissionsCount(all.filter(p => p.status === "alive" && p.currentSubmission !== null).length);
    });`
);

// 3. Replace isLobby render
code = code.replace(
  /if \(isLobby\) \{[\s\S]*?return \([\s\S]*?<div className="flex flex-col items-center justify-center h-full space-y-8 md:space-y-12 animate-fade-in z-20 px-4 text-center">[\s\S]*?<div className="text-secondary text-7xl md:text-\[100px\] lg:text-\[120px\] mb-4 md:mb-8 animate-pulse drop-shadow-glow">[\s\S]*?<SuitCycler \/>[\s\S]*?<\/div>[\s\S]*?<h1 className="text-5xl md:text-7xl lg:text-\[100px\] font-serif text-white tracking-\[0\.2em\] uppercase leading-none drop-shadow-glow">House of Trials<\/h1>[\s\S]*?<p className="text-xl md:text-3xl text-textMuted uppercase tracking-widest font-mono">[\s\S]*?\{gameState\.phase === "game_over" \? "TOURNAMENT CONCLUDED" : `\$\{gameState\.currentRoundTitle \|\| currentSlotConfig\?\.gameName \|\| "Preparing"\} — Stand By`\}[\s\S]*?<\/p>[\s\S]*?<\/div>[\s\S]*?\);[\s\S]*?\}/,
  `if (isLobby) {
      return (
        <div className="flex w-full h-full items-center justify-between px-8 md:px-16 z-20 gap-8">
           <div className="flex flex-col items-center justify-center space-y-8 flex-1">
              <div className="text-secondary text-[8vw] mb-4 animate-pulse drop-shadow-glow leading-none">
                 <SuitCycler />
              </div>
              <h1 className="text-[5vw] font-serif text-white tracking-[0.2em] uppercase leading-none drop-shadow-glow text-center">House of Trials</h1>
              <p className="text-[1.8vw] text-textMuted uppercase tracking-widest font-mono text-center">
                {gameState.phase === "game_over" ? "TOURNAMENT CONCLUDED" : \`\${gameState.currentRoundTitle || currentSlotConfig?.gameName || "Preparing"} — Stand By\`}
              </p>
           </div>
           
           <div className="w-[400px] h-[70vh] bg-surface/90 border-4 border-border p-6 flex flex-col backdrop-blur-md self-center relative shadow-glow">
              <h3 className="text-2xl font-serif text-secondary uppercase tracking-widest mb-6 text-center border-b-2 border-border/50 pb-4">Leaderboard</h3>
              <div className="flex-1 overflow-y-auto flex flex-col gap-3 pr-2 scrollbar-thin">
                 {playersData
                    .filter(p => !["waiting", "eliminated"].includes(p.status))
                    .sort((a, b) => (b.points || 0) - (a.points || 0))
                    .slice(0, 15)
                    .map((p, idx) => (
                      <div key={p.id} className="flex justify-between items-center bg-background border border-border p-3">
                         <div className="flex items-center gap-3 truncate">
                           <span className="text-lg font-mono font-bold text-textMuted">{idx + 1}.</span>
                           <span className="text-lg font-mono font-bold text-white truncate max-w-[120px]">{p.playerId}</span>
                         </div>
                         <span className="text-xl font-mono text-secondary font-bold">{p.points || 0} pts</span>
                      </div>
                 ))}
                 {playersData.filter(p => !["waiting", "eliminated"].includes(p.status)).length === 0 && (
                    <div className="text-center text-textMuted py-8 uppercase tracking-widest text-sm">No players active</div>
                 )}
              </div>
           </div>
        </div>
      );
    }`
);

// 4. Replace isOpen Generic Fallback
code = code.replace(
  /return \([\s\S]*?<div className="flex flex-col items-center justify-center h-full space-y-8 md:space-y-16 animate-fade-in z-20 w-\[90%\] md:w-3\/4">[\s\S]*?<h2 className="text-4xl md:text-6xl lg:text-\[80px\] font-serif text-white tracking-widest uppercase text-center leading-tight">[\s\S]*?\{activeGameId === "C9" && gameState\.phase === "active_a" \? "Step 1: Create your secret sequence" :[\s\S]*?activeGameId === "C9" && gameState\.phase === "active_b" \? "Step 2: Guess your opponent's sequence" :[\s\S]*?gameState\.currentRoundTitle \|\| "Submit Your Decision"\}[\s\S]*?<\/h2>[\s\S]*?\{timeLeft !== null && \([\s\S]*?<div className="text-\[120px\] md:text-\[200px\] font-mono font-bold leading-none tracking-widest text-primary drop-shadow-glow-red">[\s\S]*?\{timeLeft < 10 \? `0\$\{timeLeft\}` : timeLeft\}[\s\S]*?<\/div>[\s\S]*?\)\}[\s\S]*?<div className="w-full space-y-4">[\s\S]*?<div className="flex justify-between items-end">[\s\S]*?<span className="text-xl text-textMuted font-mono uppercase tracking-widest">[\s\S]*?\{submissionsCount\} \/ \{playersAlive\} Received[\s\S]*?<\/span>[\s\S]*?<span className="text-xl text-secondary font-mono uppercase tracking-widest animate-pulse">[\s\S]*?Submit on your device[\s\S]*?<\/span>[\s\S]*?<\/div>[\s\S]*?<div className="w-full bg-surface border-4 border-border h-6 overflow-hidden">[\s\S]*?<motion\.div[\s\S]*?className="h-full bg-secondary"[\s\S]*?initial=\{\{ width: 0 \}\}[\s\S]*?animate=\{\{ width: `\$\{playersAlive > 0 \? \(submissionsCount \/ playersAlive\) \* 100 : 0\}%` \}\}[\s\S]*?transition=\{\{ duration: 0\.5 \}\}[\s\S]*?\/>[\s\S]*?<\/div>[\s\S]*?<\/div>[\s\S]*?<\/div>[\s\S]*?\);/,
  `return (
        <div className="flex flex-col items-center justify-center h-full w-[95%] z-20 space-y-6 md:space-y-8 pt-8">
           <h2 className="text-[3vw] font-serif text-white tracking-widest uppercase text-center leading-tight">
             {activeGameId === "C9" && gameState.phase === "active_a" ? "Step 1: Create your secret sequence" :
              activeGameId === "C9" && gameState.phase === "active_b" ? "Step 2: Guess your opponent's sequence" :
              gameState.currentRoundTitle || "Submit Your Decision"}
           </h2>
           
           {timeLeft !== null && (
             <div className="text-[12vw] font-mono font-bold leading-none tracking-widest text-primary drop-shadow-glow-red">
               {timeLeft < 10 ? \`0\${timeLeft}\` : timeLeft}
             </div>
           )}

           <div className="w-full flex-1 max-h-[35vh] border-4 border-border bg-surface/90 backdrop-blur-sm p-6 flex flex-col mb-4">
              <div className="flex justify-between items-end mb-4">
                 <span className="text-[1.5vw] text-textMuted font-mono uppercase tracking-widest">
                    {submissionsCount} / {playersAlive} Received
                 </span>
                 <span className="text-[1.5vw] text-secondary font-mono uppercase tracking-widest animate-pulse">
                    Submit on your device
                 </span>
              </div>
              <div className="w-full bg-background border border-border h-4 mb-6 shrink-0">
                 <motion.div 
                    className="h-full bg-secondary"
                    initial={{ width: 0 }}
                    animate={{ width: \`\${playersAlive > 0 ? (submissionsCount / playersAlive) * 100 : 0}%\` }}
                    transition={{ duration: 0.5 }}
                 />
              </div>
              
              <div className="flex-1 overflow-y-auto scrollbar-thin">
                 <div className="flex flex-wrap gap-2 content-start items-start">
                    <AnimatePresence>
                      {playersData.filter(p => !["waiting", "eliminated"].includes(p.status)).sort((a,b) => a.playerId.localeCompare(b.playerId)).map(p => {
                         const hasSubmitted = p.currentSubmission !== null;
                         return (
                           <motion.div 
                             key={p.id}
                             initial={{ scale: 0.8, opacity: 0 }}
                             animate={{ scale: 1, opacity: 1 }}
                             className={\`px-3 py-1 border font-mono text-sm transition-colors duration-500
                                \${hasSubmitted ? 'border-secondary bg-secondary/20 text-secondary font-bold' : 'border-border bg-background/50 text-textMuted'}
                             \`}
                           >
                              {p.playerId}
                           </motion.div>
                         );
                      })}
                    </AnimatePresence>
                 </div>
              </div>
           </div>
        </div>
      );`
);

fs.writeFileSync('src/app/projector/ProjectorClient.tsx', code);
console.log('Projector Refactored');
