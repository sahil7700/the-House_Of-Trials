"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { motion } from "framer-motion";

export default function AdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push("/admin/dashboard");
    } catch (err: any) {
      console.error(err);
      setError("Unauthorized access.");
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background relative bg-scanlines">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm bg-surface border border-border p-8 relative z-10"
      >
        <div className="text-center mb-8">
          <h1 className="text-xl font-mono text-textMuted tracking-widest uppercase mb-2">Systems</h1>
          <p className="text-2xl font-serif text-textDefault tracking-wide">Administrator</p>
        </div>

        {error && (
          <div className="mb-6 p-3 border border-primary/50 text-primary text-xs font-mono uppercase tracking-widest text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <input 
              type="email" 
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-background border border-border px-4 py-3 text-textDefault font-mono text-sm focus:outline-none focus:border-textMuted transition-colors"
              placeholder="Email"
            />
          </div>

          <div className="space-y-2">
            <input 
              type="password" 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-background border border-border px-4 py-3 text-textDefault font-mono text-sm focus:outline-none focus:border-textMuted transition-colors"
              placeholder="Password"
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-4 mt-4 bg-textDefault text-background font-mono text-sm tracking-widest uppercase hover:bg-textMuted transition-colors disabled:opacity-50"
          >
            {loading ? "Authenticating..." : "Login"}
          </button>
        </form>
      </motion.div>
    </main>
  );
}
