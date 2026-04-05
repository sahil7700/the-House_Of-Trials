import { GameState } from "@/lib/services/game-service";
import { PlayerData } from "@/lib/services/player-service";

interface Props {
  gameState: GameState;
  players: PlayerData[];
}

export default function AdminGameStats({ gameState, players }: Props) {
  const alivePlayers = players.filter(p => p.status === "alive");
  const submissions = alivePlayers.filter(p => p.currentSubmission !== null && p.currentSubmission !== undefined);
  
  if (gameState.currentGameId === "A1") {
    // A1: Distribution mapping
    const bucketSize = 10;
    const buckets = Array.from({ length: 10 }, () => 0);
    
    let sum = 0;
    submissions.forEach(p => {
       const val = Number(p.currentSubmission);
       if (!isNaN(val)) {
           sum += val;
           const bIdx = Math.min(9, Math.floor(val / bucketSize));
           buckets[bIdx]++;
       }
    });
    
    const avg = submissions.length > 0 ? (sum / submissions.length) : 0;
    const target = avg * (2/3);

    return (
      <div className="w-full space-y-4">
         <div className="flex justify-between text-xs tracking-widest uppercase border border-border bg-surface p-4 text-center">
            <div>
               <p className="text-textMuted mb-2">Live Average</p>
               <p className="text-xl text-textDefault font-bold">{avg.toFixed(2)}</p>
            </div>
            <div>
               <p className="text-secondary mb-2">Live Target (2/3)</p>
               <p className="text-xl text-secondary font-bold">{target.toFixed(2)}</p>
            </div>
         </div>
         <div className="w-full bg-surface border border-border p-4">
            <p className="text-xs uppercase tracking-widest text-textMuted mb-4 text-center">Live Distribution</p>
            <div className="flex items-end justify-between h-24 gap-1">
               {buckets.map((b, i) => {
                 const pct = submissions.length > 0 ? (b / submissions.length) * 100 : 0;
                 return (
                   <div key={i} className="flex-1 flex flex-col justify-end items-center group relative">
                     <div className="w-full bg-primary/80 transition-all" style={{ height: `${pct}%`, minHeight: b > 0 ? '4px' : '0' }}></div>
                     <p className="text-[8px] text-textMuted mt-1">{i*10}-{(i+1)*10}</p>
                     {b > 0 && <span className="absolute -top-6 text-[10px] bg-background border px-1 opacity-0 group-hover:opacity-100">{b}</span>}
                   </div>
                 )
               })}
            </div>
         </div>
      </div>
    );
  }

  if (gameState.currentGameId === "A2") {
    // A2: Population map
    const counts: Record<string, number> = {};
    const rangesList = ["1-10", "11-20", "21-30", "31-40", "41-50", "51-60", "61-70", "71-80", "81-90", "91-100"];
    rangesList.forEach(r => counts[r] = 0);
    
    submissions.forEach(p => {
       if (typeof p.currentSubmission === "string") counts[p.currentSubmission]++;
    });

    return (
       <div className="w-full space-y-4 border p-4 bg-surface border-border">
          <p className="text-xs uppercase tracking-widest text-textMuted mb-4 text-center">Live Population Map</p>
          <div className="grid grid-cols-2 gap-4">
             {rangesList.map(r => {
                const c = counts[r];
                const pct = submissions.length > 0 ? (c / submissions.length) * 100 : 0;
                const isCrowded = pct > 20; // Example threshold
                return (
                   <div key={r} className="flex items-center space-x-2 text-xs font-mono">
                      <span className="w-16">{r}</span>
                      <div className="flex-1 h-3 bg-background border border-border relative">
                         <div className={`absolute left-0 top-0 bottom-0 ${isCrowded ? 'bg-primary' : 'bg-textMuted'}`} style={{width: `${pct}%`}} />
                      </div>
                      <span className={isCrowded ? 'text-primary font-bold' : 'text-textMuted'}>{c}</span>
                   </div>
                );
             })}
          </div>
       </div>
    );
  }

  if (gameState.currentGameId === "A3") {
     const sum = submissions.reduce((acc, curr) => acc + Number(curr.currentSubmission || 0), 0);
     const avg = submissions.length > 0 ? sum / submissions.length : 0;
     
     // Histogram of bids
     const buckets = Array.from({ length: 11 }, () => 0); // 0-9, 10-19... 100
     submissions.forEach(p => {
        const val = Number(p.currentSubmission);
        if (!isNaN(val)) {
            const bIdx = Math.min(10, Math.floor(val / 10));
            buckets[bIdx]++;
        }
     });

     return (
       <div className="w-full space-y-4">
          <div className="text-center p-4 border border-border bg-surface">
             <p className="text-xs text-textMuted uppercase tracking-widest">Average Bid</p>
             <p className="text-2xl font-bold">{avg.toFixed(1)}</p>
          </div>
          <div className="w-full bg-surface border border-border p-4">
            <p className="text-[10px] uppercase tracking-widest text-textMuted mb-2 text-center">Bid Distribution (0-100)</p>
            <div className="flex items-end justify-between h-16 gap-1">
               {buckets.map((b, i) => {
                 const pct = submissions.length > 0 ? (b / submissions.length) * 100 : 0;
                 return (
                   <div key={i} className="flex-1 bg-secondary/80 transition-all" style={{ height: `${pct}%`, minHeight: b > 0 ? '2px' : '0' }}></div>
                 )
               })}
            </div>
         </div>
       </div>
     );
  }

  if (gameState.currentGameId === "A4") {
     const firstChoices: Record<string, number> = {};
     let majorityBet = "";
     let maxBets = -1;

     submissions.forEach(p => {
        const arr = p.currentSubmission;
        if (Array.isArray(arr) && arr.length > 0) {
           const first = arr[0];
           firstChoices[first] = (firstChoices[first] || 0) + 1;
           if (firstChoices[first] > maxBets) {
              maxBets = firstChoices[first];
              majorityBet = first;
           }
        }
     });

     return (
       <div className="w-full space-y-4 border p-4 bg-surface border-border">
          <p className="text-xs uppercase tracking-widest text-textMuted mb-4 text-center">1st Choice Distribution (Player Bets)</p>
          {Object.keys(firstChoices).length === 0 ? (
             <p className="text-center text-sm text-textMuted">No votes ranked yet</p>
          ) : (
            <div className="space-y-2 text-xs font-mono">
               {Object.entries(firstChoices).sort((a,b) => b[1] - a[1]).map(([opt, bets]) => (
                  <div key={opt} className="flex justify-between items-center p-2 border border-border bg-background">
                     <span className="uppercase">{opt}</span>
                     <span>{bets} betting this is 2nd</span>
                  </div>
               ))}
            </div>
          )}
          {majorityBet && (
             <p className="text-xs text-primary mt-4 border-l-2 border-primary pl-2 uppercase tracking-widest">
               Most believe <span className="font-bold">{majorityBet}</span> will win.
             </p>
          )}
       </div>
     );
  }

  return null;
}
