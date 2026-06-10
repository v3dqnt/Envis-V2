"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2 } from "lucide-react";
import {
  ShieldChevron,
  GoogleLogo,
  EnvelopeSimple,
  LockKey,
} from "@phosphor-icons/react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const supabase = createClient();

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    if (isSignUp) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `https://envistwo.vercel.app/auth/callback` },
      });
      if (error) setError(error.message);
      else setMessage("Check your email to confirm your account.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      else window.location.href = "/";
    }
    setLoading(false);
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `https://envistwo.vercel.app/auth/callback` },
    });
    if (error) { setError(error.message); setGoogleLoading(false); }
  };

  return (
    <div className="min-h-screen bg-[#070709] flex items-center justify-center p-4 overflow-hidden relative">
      {/* Ambient glow blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-emerald-500/5 blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full bg-emerald-600/4 blur-[100px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full bg-emerald-500/3 blur-[80px]" />
      </div>

      {/* Subtle grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.025] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="w-full max-w-sm relative z-10">
        {/* Logo */}
        <div className="flex flex-col items-center gap-4 mb-8">
          <div className="relative">
            <div className="absolute inset-0 rounded-2xl bg-emerald-500/20 blur-xl scale-150" />
            <div className="relative icon-bubble-emerald w-16 h-16 rounded-2xl flex items-center justify-center">
              <ShieldChevron weight="duotone" size={32} className="text-emerald-400" />
            </div>
          </div>
          <div className="text-center">
            <h1 className="text-white font-black text-2xl tracking-tight">Aegis</h1>
            <p className="text-neutral-500 text-xs mt-1 tracking-widest uppercase">
              Disaster Evacuation Control
            </p>
          </div>
        </div>

        {/* Card */}
        <div className="glass-panel glow-border rounded-2xl p-6 space-y-5">
          <div>
            <h2 className="text-white font-bold text-sm">
              {isSignUp ? "Create account" : "Welcome back"}
            </h2>
            <p className="text-neutral-500 text-xs mt-0.5">
              {isSignUp ? "Join the Aegis network" : "Sign in to your command center"}
            </p>
          </div>

          {/* Google */}
          <button
            onClick={handleGoogle}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-3 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white font-semibold text-sm py-2.5 rounded-xl transition-all disabled:opacity-50"
          >
            {googleLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <GoogleLogo weight="bold" size={16} className="text-white" />
            )}
            Continue with Google
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-white/8" />
            <span className="text-neutral-600 text-xs">or</span>
            <div className="flex-1 h-px bg-white/8" />
          </div>

          {/* Email/Password */}
          <form onSubmit={handleEmailAuth} className="space-y-3">
            <div className="relative">
              <EnvelopeSimple weight="duotone" size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" />
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-white/5 border border-white/8 hover:border-white/15 text-white placeholder-neutral-600 text-sm pl-9 pr-3.5 py-2.5 rounded-xl outline-none focus:border-emerald-500/50 focus:bg-emerald-500/5 transition-all"
              />
            </div>
            <div className="relative">
              <LockKey weight="duotone" size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-white/5 border border-white/8 hover:border-white/15 text-white placeholder-neutral-600 text-sm pl-9 pr-3.5 py-2.5 rounded-xl outline-none focus:border-emerald-500/50 focus:bg-emerald-500/5 transition-all"
              />
            </div>

            {error && <p className="text-red-400 text-xs">{error}</p>}
            {message && <p className="text-emerald-400 text-xs">{message}</p>}

            <button
              type="submit"
              disabled={loading}
              className="btn-gradient w-full text-white font-bold text-sm py-2.5 rounded-xl flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {isSignUp ? "Create account" : "Sign in"}
            </button>
          </form>

          <p className="text-center text-neutral-600 text-xs">
            {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
            <button
              onClick={() => { setIsSignUp(!isSignUp); setError(null); setMessage(null); }}
              className="text-emerald-400 hover:text-emerald-300 font-semibold transition-colors"
            >
              {isSignUp ? "Sign in" : "Sign up"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
