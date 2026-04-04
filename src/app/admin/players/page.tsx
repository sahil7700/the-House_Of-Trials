"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, query, updateDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PlayerData } from "@/lib/services/player-service";

export default function PlayersAdmin() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  
  const [players, setPlayers] = useState<PlayerData[]>([]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/admin");
      return;
    }
    
    const playersQuery = query(collection(db, "players"));
    const unsub = onSnapshot(playersQuery, (snapshot) => {
      const p = snapshot.docs.map(d => d.data() as PlayerData);
      setPlayers(p);
    });

    return () => unsub();
  }, [user, authLoading, router]);

  if (authLoading) return <div className="p-8 font-mono text-textMuted bg-background min-h-screen">Verifying identity...</div>;

  const handleManualAction = async (uid: string, currentStatus: string) => {
     const newStatus = currentStatus === "eliminated" ? "alive" : "eliminated";
     if (confirm(`Change status to ${newStatus}?`)) {
        await updateDoc(doc(db, "players", uid), { status: newStatus });
     }
  };

  const handleAddPoints = async (uid: string, currentPoints: number) => {
    const pts = prompt("Enter points to add (or subtract if negative):", "0");
    if (pts) {
      const p = Number(pts);
      if (!isNaN(p)) {
         await updateDoc(doc(db, "players", uid), { points: (currentPoints || 0) + p });
      }
    }
  };

  return (
    <main className="min-h-screen bg-background text-textDefault p-8 font-mono overflow-y-auto">
       <div className="max-w-6xl mx-auto space-y-8">
           <header className="border-b border-border pb-4 flex justify-between items-end">
             <div>
                <h1 className="font-serif text-3xl tracking-widest uppercase text-textDefault">Player Ledger</h1>
                <p className="text-sm text-textMuted mt-2 tracking-widest">Global Master List ({players.length} Total Registered)</p>
             </div>
           </header>

           <div className="overflow-x-auto border border-border bg-surface/50">
             <table className="w-full text-left font-mono">
               <thead className="bg-surface border-b border-border text-textMuted text-xs uppercase tracking-widest">
                 <tr>
                   <th className="p-4">Player ID</th>
                   <th className="p-4">Name</th>
                   <th className="p-4">College</th>
                   <th className="p-4">Status</th>
                   <th className="p-4">Points</th>
                   <th className="p-4">Manual Override</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-border/50 text-sm">
                  {players.sort((a,b) => (b.points || 0) - (a.points || 0)).map(p => (
                     <tr key={p.id} className="hover:bg-surface transition-colors">
                       <td className="p-4 text-secondary font-bold">{p.playerId}</td>
                       <td className="p-4">{p.name}</td>
                       <td className="p-4 text-textMuted">{p.college}</td>
                       <td className="p-4">
                         <span className={`${p.status === 'eliminated' ? 'text-primary border-primary' : 'text-success border-success'} p-1 px-2 border text-[10px] uppercase tracking-widest`}>
                           {p.status}
                         </span>
                       </td>
                       <td className="p-4 font-bold">{p.points || 0}</td>
                       <td className="p-4 space-x-2">
                           <button 
                             onClick={() => handleManualAction(p.id, p.status)} 
                             className="bg-transparent border border-border hover:border-white px-3 py-1 text-xs uppercase tracking-widest transition-colors"
                           >
                             Revive/Kill
                           </button>
                           <button 
                             onClick={() => handleAddPoints(p.id, p.points)} 
                             className="bg-primary/20 text-primary hover:bg-primary hover:text-white border border-primary px-3 py-1 text-xs uppercase tracking-widest transition-colors"
                           >
                             Adjust Pts
                           </button>
                       </td>
                     </tr>
                  ))}
               </tbody>
             </table>
             {players.length === 0 && (
                <div className="p-8 text-center text-textMuted text-sm uppercase tracking-widest">
                  No players registered.
                </div>
             )}
           </div>
       </div>
    </main>
  );
}
