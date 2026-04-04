"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { registerPlayer } from "@/lib/services/player-service";
import { motion } from "framer-motion";

export default function JoinPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [college, setCollege] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !college) return;
    
    setLoading(true);
    setError("");

    try {
      await registerPlayer(name, college, phone);
      // Let them see the success state for a second or just nav
      router.push("/lobby");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to register. Please try again.");
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-scanlines relative">
      <div className="absolute inset-0 bg-background mix-blend-overlay pointer-events-none" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-surface border border-border p-8 shadow-[0_0_8px_rgba(192,57,43,0.1)] relative z-10"
      >
        <div className="text-center mb-8">
          <h1 className="text-3xl font-serif text-textDefault tracking-widest uppercase mb-2">Registration</h1>
          <p className="text-sm text-textMuted font-mono">Input requested. Identify yourself.</p>
        </div>

        {error && (
          <div className="mb-6 p-3 border border-primary/50 bg-primary/10 text-primary text-sm font-mono">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs tracking-widest text-textMuted uppercase font-mono">Full Name</label>
            <input 
              type="text" 
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-background border border-border px-4 py-3 text-textDefault font-mono focus:outline-none focus:border-secondary focus:shadow-glow-gold transition-all"
              placeholder="e.g. Arisu Ryohei"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs tracking-widest text-textMuted uppercase font-mono">College / Department</label>
            <input 
              type="text" 
              required
              value={college}
              onChange={(e) => setCollege(e.target.value)}
              className="w-full bg-background border border-border px-4 py-3 text-textDefault font-mono focus:outline-none focus:border-secondary focus:shadow-glow-gold transition-all"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs tracking-widest text-textMuted uppercase font-mono">Phone Number (Optional)</label>
            <input 
              type="tel" 
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full bg-background border border-border px-4 py-3 text-textDefault font-mono focus:outline-none focus:border-secondary focus:shadow-glow-gold transition-all"
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-4 mt-4 bg-primary/10 border-2 border-primary text-primary font-mono tracking-widest uppercase transition-all duration-300 hover:bg-primary hover:text-white hover:shadow-[0_0_20px_rgba(192,57,43,0.6)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Registering..." : "Submit"}
          </button>
        </form>
      </motion.div>
    </main>
  );
}
