"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { EventConfig, GameSlotConfig } from "@/lib/services/game-service";
import { nukeDatabase, saveEventConfig } from "@/lib/services/admin-service";

const AVAILABLE_GAMES = [
  { id: "A1", name: "A1: Majority Trap (2/3 Average)" },
  { id: "A2", name: "A2: Minority Trap (Range Hunter)" },
  { id: "A3", name: "A3: Traveler's Dilemma" },
  { id: "A4", name: "A4: Borda Sabotage (Strategic Vote)" },
  { id: "B5", name: "B5: Nashify / Black Hole (Physical puzzle)" },
  { id: "B6", name: "B6: Bidding Survival" },
  { id: "B7", name: "B7: Braess Paradox" },
  { id: "B8", name: "B8: Information Cascade" },
  { id: "C9", name: "C9: Sequence Match" },
  { id: "C10", name: "C10: Peak Finder" }
];

export default function GameBuilder() {
  const { user, loading } = useAuth();
  const router = useRouter();
  
  const [eventName, setEventName] = useState("House of Trials 2026");
  const [totalSlots, setTotalSlots] = useState(3);
  const [activeTab, setActiveTab] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [slots, setSlots] = useState<GameSlotConfig[]>(() => {
    return Array.from({ length: 12 }, (_, i) => ({
      slotNumber: i + 1,
      gameId: "A1",
      gameName: "A1: Majority Trap (2/3 Average)",
      status: "pending" as const,
      config: {
        timerSeconds: 60,
        pointsFirst: 50,
        pointsSecond: 30,
        pointsThird: 10,
        pointsSafe: 20,
        pointsEliminated: 0,
        eliminationMode: "fixed" as const,
        eliminationValue: 1,
        advancementCount: 1,
        tieBreaker: "eliminate_all" as const,
        penaltyNoSubmit: -10,
        bonusTopN: 0,
        visibleToPlayers: true,
        gameSpecificConfig: {}
      }
    }));
  });

  if (loading) return null;
  if (!user) {
    router.push("/admin");
    return null;
  }

  const handleUpdateSlot = (slotNumber: number, field: string, value: any) => {
    setSlots(prev => prev.map(s => {
      if (s.slotNumber !== slotNumber) return s;
      
      const updated = { ...s };
      if (field === "gameId") {
        updated.gameId = value;
        updated.gameName = AVAILABLE_GAMES.find(g => g.id === value)?.name || "";
      } else {
        (updated.config as any)[field] = value;
      }
      return updated;
    }));
  };

  const handleCreateEvent = async () => {
    if (!confirm("WARNING: This will DESTROY ALL EXISTING EVENT DATA (Players, Submissions, GameState). Are you sure?")) {
      return;
    }
    
    setIsSaving(true);
    try {
      const activeSlots = slots.slice(0, totalSlots);
      const eventConfig: EventConfig = {
        eventName,
        totalSlots,
        slots: activeSlots
      };
      
      console.log("Saving Event Config:", eventConfig);
      
      await nukeDatabase(); // Wipe previous db and reset GameState
      await saveEventConfig(eventConfig);
      
      router.push("/admin/dashboard");
    } catch (e) {
      console.error(e);
      alert("Failed to initialize event.");
    }
    setIsSaving(false);
  };

  const activeSlot = slots[activeTab - 1];

  return (
    <main className="min-h-screen bg-background text-textDefault flex flex-col font-mono p-8 bg-scanlines overflow-y-auto">
      <div className="max-w-6xl mx-auto w-full space-y-8 bg-surface/90 p-8 border border-border mt-8 relative z-10">
        <h1 className="font-serif text-3xl tracking-widest uppercase border-b border-border pb-4 text-primary drop-shadow-glow-red">
          Event Configurator
        </h1>

        <section className="grid grid-cols-2 gap-8">
          <div>
            <label className="text-secondary text-xs uppercase tracking-widest block mb-2">Event Title</label>
            <input 
              value={eventName} onChange={e => setEventName(e.target.value)} 
              className="bg-background border border-border px-4 py-2 w-full focus:outline-none focus:border-primary" 
            />
          </div>
          <div>
            <label className="text-secondary text-xs uppercase tracking-widest block mb-2">Total Slots (3-12)</label>
            <input 
              type="number" min="3" max="12"
              value={totalSlots} onChange={e => setTotalSlots(Number(e.target.value))} 
              className="bg-background border border-border px-4 py-2 w-full focus:outline-none focus:border-primary" 
            />
          </div>
        </section>

        {/* Builder Panel */}
        <section className="flex gap-8 items-start border-t border-border pt-8">
          {/* Slots Nav */}
          <div className="w-1/4 flex flex-col gap-2">
            {Array.from({ length: totalSlots }).map((_, i) => (
              <button 
                key={i}
                onClick={() => setActiveTab(i + 1)}
                className={`text-left px-4 py-3 border ${activeTab === i + 1 ? 'bg-primary/20 border-primary text-primary shadow-glow-red' : 'bg-background border-border text-textMuted hover:border-secondary'}`}
              >
                <div className="text-xs uppercase tracking-widest">Slot {i + 1}</div>
                <div className="truncate mt-1">{slots[i].gameName}</div>
              </button>
            ))}
          </div>

          {/* Active Slot Editor */}
          {activeSlot && (
            <div className="flex-1 bg-background border border-border p-6 space-y-6">
              <h2 className="text-xl uppercase tracking-widest text-secondary border-b border-border/50 pb-2">
                Configure Slot {activeSlot.slotNumber}
              </h2>
              
              <div className="grid grid-cols-2 gap-6">
                <div className="col-span-2">
                  <label className="text-textMuted text-xs uppercase tracking-widest block mb-2">Assign Game</label>
                  <select 
                    value={activeSlot.gameId} 
                    onChange={e => handleUpdateSlot(activeSlot.slotNumber, "gameId", e.target.value)}
                    className="bg-surface border border-border px-4 py-2 w-full text-white appearance-none"
                  >
                    {AVAILABLE_GAMES.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-textMuted text-xs uppercase tracking-widest block mb-2">Timer Duration (Sec)</label>
                  <input 
                    type="number" 
                    value={activeSlot.config.timerSeconds} 
                    onChange={e => handleUpdateSlot(activeSlot.slotNumber, "timerSeconds", Number(e.target.value))}
                    className="bg-surface border border-border px-4 py-2 w-full"
                  />
                </div>
                
                <div>
                  <label className="text-textMuted text-xs uppercase tracking-widest block mb-2">Elimination Mode</label>
                  <select 
                    value={activeSlot.config.eliminationMode}
                    onChange={e => handleUpdateSlot(activeSlot.slotNumber, "eliminationMode", e.target.value)}
                    className="bg-surface border border-border px-4 py-2 w-full text-white appearance-none"
                  >
                    <option value="fixed">Fixed N Players</option>
                    <option value="percentage">Bottom X% Percentage</option>
                    <option value="threshold">Score Threshold</option>
                    <option value="majority">Majority/Minority</option>
                  </select>
                </div>
                
                <div>
                  <label className="text-textMuted text-xs uppercase tracking-widest block mb-2">Elimination Value</label>
                  <input 
                    type="number" 
                    value={activeSlot.config.eliminationValue} 
                    onChange={e => handleUpdateSlot(activeSlot.slotNumber, "eliminationValue", Number(e.target.value))}
                    className="bg-surface border border-border px-4 py-2 w-full"
                  />
                </div>

                <div>
                  <label className="text-textMuted text-xs uppercase tracking-widest block mb-2">Advancement Count (UI Predictor)</label>
                  <input 
                    type="number" 
                    value={activeSlot.config.advancementCount} 
                    onChange={e => handleUpdateSlot(activeSlot.slotNumber, "advancementCount", Number(e.target.value))}
                    className="bg-surface border border-border px-4 py-2 w-full"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-border/50">
                <div>
                  <label className="text-textMuted text-xs uppercase tracking-widest block mb-2">Points 1st</label>
                  <input type="number" value={activeSlot.config.pointsFirst} onChange={e => handleUpdateSlot(activeSlot.slotNumber, "pointsFirst", Number(e.target.value))} className="bg-surface border border-border px-4 py-2 w-full" />
                </div>
                <div>
                  <label className="text-textMuted text-xs uppercase tracking-widest block mb-2">Points Safe</label>
                  <input type="number" value={activeSlot.config.pointsSafe} onChange={e => handleUpdateSlot(activeSlot.slotNumber, "pointsSafe", Number(e.target.value))} className="bg-surface border border-border px-4 py-2 w-full" />
                </div>
                <div>
                  <label className="text-textMuted text-xs uppercase tracking-widest block mb-2">Points Eliminated</label>
                  <input type="number" value={activeSlot.config.pointsEliminated} onChange={e => handleUpdateSlot(activeSlot.slotNumber, "pointsEliminated", Number(e.target.value))} className="bg-surface border border-border px-4 py-2 w-full" />
                </div>
              </div>
              
              {/* Game Specific logic example */}
              {(activeSlot.gameId === "A4") && (
                <div className="bg-primary/10 border border-primary p-4 space-y-4">
                  <h3 className="text-primary text-xs uppercase tracking-widest">Borda Sabotage Options</h3>
                  <textarea 
                    placeholder='{"options":["A","B","C","D"]}' 
                    className="bg-background border border-border w-full p-2 h-20 text-xs"
                    onChange={e => handleUpdateSlot(activeSlot.slotNumber, "gameSpecificConfig", { options: e.target.value.split(",") })}
                  />
                  <p className="text-[10px] text-textMuted">Comma separated options</p>
                </div>
              )}
            </div>
          )}
        </section>
        
        <div className="border-t border-border pt-6 flex justify-end">
          <button 
            disabled={isSaving}
            onClick={handleCreateEvent}
            className="group relative inline-flex items-center justify-center px-8 py-4 bg-primary/20 border-2 border-primary text-primary hover:bg-primary hover:text-white transition-all uppercase tracking-widest shadow-glow-red"
          >
            {isSaving ? "Initializing..." : "LOCK CONFIG AND RESET DATABASE"} 
          </button>
        </div>

      </div>
    </main>
  );
}
