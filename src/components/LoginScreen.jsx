import React, { useState } from 'react';
import { BarChart3, Mail, AlertCircle, Chrome, Loader2, User, Lock, UserPlus, LogIn, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { signInWithGoogle, signInWithFacebook, signInLocal, registerLocal, isConfigured } from '../utils/firebase';
import { Capacitor } from '@capacitor/core';
// Facebook "F" icon
const FacebookIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
  </svg>
);

// ─── Shared layout wrapper ──────────────────────────────────────────────────
const Wrapper = ({ children }) => (
  <div style={{
    minHeight: '100dvh', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    background: 'var(--bg-app)', padding: '24px 20px',
    position: 'relative', overflow: 'hidden',
  }}>
    {/* Glow orbs */}
    <div style={{ position:'absolute', top:'-80px', left:'-80px', width:280, height:280, borderRadius:'50%', background:'radial-gradient(circle, rgba(91,94,244,0.18) 0%, transparent 70%)', pointerEvents:'none' }} />
    <div style={{ position:'absolute', bottom:'-60px', right:'-60px', width:240, height:240, borderRadius:'50%', background:'radial-gradient(circle, rgba(168,85,247,0.15) 0%, transparent 70%)', pointerEvents:'none' }} />
    {children}
  </div>
);

// ─── Shared Logo + Title ────────────────────────────────────────────────────
const Logo = () => (
  <>
    <div style={{ width:72, height:72, background:'linear-gradient(135deg,#5b5ef4 0%,#a855f7 100%)', borderRadius:22, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:20, boxShadow:'0 0 48px rgba(91,94,244,0.45),0 8px 32px rgba(0,0,0,0.4)' }}>
      <BarChart3 style={{ width:36, height:36, color:'#fff' }} />
    </div>
    <h1 style={{ fontSize:26, fontWeight:900, color:'var(--text-primary)', textAlign:'center', marginBottom:6, letterSpacing:'-0.03em' }}>
      Drabyashree Nepse Hub
    </h1>
    <p style={{ fontSize:13, color:'var(--text-muted)', textAlign:'center', marginBottom:32, lineHeight:1.5, maxWidth:280 }}>
      Nepal's smartest stock market companion.
    </p>
  </>
);

// ─── Shared error banner ────────────────────────────────────────────────────
const ErrorBanner = ({ error }) => error ? (
  <div style={{ marginTop:14, padding:'10px 12px', borderRadius:'var(--radius-md)', background:'rgba(245,69,92,0.08)', border:'1px solid rgba(245,69,92,0.25)', display:'flex', alignItems:'flex-start', gap:8 }}>
    <AlertCircle style={{ width:14, height:14, color:'var(--bear)', flexShrink:0, marginTop:1 }} />
    <p style={{ fontSize:11.5, color:'var(--bear)', margin:0, lineHeight:1.5 }}>{error}</p>
  </div>
) : null;

// ─── Input style helper ──────────────────────────────────────────────────────
const inputStyle = {
  width:'100%', padding:'11px 14px', borderRadius:'var(--radius-md)',
  border:'1px solid var(--border)', background:'rgba(255,255,255,0.04)',
  color:'var(--text-primary)', fontSize:14, outline:'none',
  boxSizing:'border-box',
};

export default function LoginScreen({ onLogin }) {
  // 'main' | 'signin' | 'register'
  const [view, setView]       = useState('main');
  const [loading, setLoading] = useState(null);
  const [error, setError]     = useState('');

  // Form fields
  const [name, setName]           = useState('');
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [showPw, setShowPw]       = useState(false);
  const configured = isConfigured();

  const clearErr = () => setError('');

  // ── Google sign-in ──────────────────────────────────────────────────────────
  const handleGoogle = async () => {
    clearErr(); setLoading('google');
    try {
      const user = await signInWithGoogle();
      if (user) onLogin(user);
    } catch (err) {
      setError(getFriendlyError(err));
    } finally { setLoading(null); }
  };

  // ── Facebook sign-in ────────────────────────────────────────────────────────
  const handleFacebook = async () => {
    clearErr(); setLoading('facebook');
    try {
      const user = await signInWithFacebook();
      if (user) onLogin(user);
    } catch (err) {
      setError(getFriendlyError(err));
    } finally { setLoading(null); }
  };

  // ── Local email sign-in ─────────────────────────────────────────────────────
  const handleSignIn = (e) => {
    e.preventDefault(); clearErr(); setLoading('email');
    try {
      const user = signInLocal(email, password);
      onLogin(user);
    } catch (err) {
      setError(err.message);
    } finally { setLoading(null); }
  };

  // ── Local registration ──────────────────────────────────────────────────────
  const handleRegister = (e) => {
    e.preventDefault(); clearErr(); setLoading('register');
    try {
      const user = registerLocal(name, email, password);
      onLogin(user);
    } catch (err) {
      setError(err.message);
    } finally { setLoading(null); }
  };

  // ── Guest mode ──────────────────────────────────────────────────────────────
  const handleGuest = () => {
    setLoading('guest');
    setTimeout(() => {
      onLogin({
        uid: 'guest_local', displayName: 'Guest User',
        email: null, photoURL: null, isGuest: true,
      });
    }, 400);
  };



  // ═══════════════════════════════════════════════════════════════════════════
  //  VIEW: EMAIL SIGN IN
  // ═══════════════════════════════════════════════════════════════════════════
  if (view === 'signin') {
    return (
      <Wrapper>
        <Logo />
        <div style={{ width:'100%', maxWidth:360, background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', padding:'28px 24px', boxShadow:'0 20px 60px rgba(0,0,0,0.35)' }}>
          <button onClick={() => { setView('main'); clearErr(); }} style={{ display:'flex', alignItems:'center', gap:4, background:'none', border:'none', color:'var(--text-muted)', fontSize:12, fontWeight:600, cursor:'pointer', marginBottom:20, padding:0 }}>
            <ArrowLeft style={{ width:14, height:14 }} /> Back
          </button>

          <h2 style={{ fontSize:18, fontWeight:800, color:'var(--text-primary)', marginBottom:20 }}>Sign In to Your Account</h2>

          <form onSubmit={handleSignIn} style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div>
              <label style={{ fontSize:11, fontWeight:600, color:'var(--text-muted)', display:'block', marginBottom:5 }}>Email Address</label>
              <input id="input-signin-email" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" style={inputStyle} />
            </div>
            <div style={{ position:'relative' }}>
              <label style={{ fontSize:11, fontWeight:600, color:'var(--text-muted)', display:'block', marginBottom:5 }}>Password</label>
              <input id="input-signin-password" type={showPw ? 'text' : 'password'} required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••" style={{ ...inputStyle, paddingRight:40 }} />
              <button type="button" onClick={() => setShowPw(v => !v)} style={{ position:'absolute', right:10, bottom:10, background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', padding:0 }}>
                {showPw ? <EyeOff style={{ width:15, height:15 }} /> : <Eye style={{ width:15, height:15 }} />}
              </button>
            </div>

            <ErrorBanner error={error} />

            <button id="btn-signin-submit" type="submit" disabled={!!loading} className="btn-primary" style={{ width:'100%', padding:'12px 0', display:'flex', justifyContent:'center', alignItems:'center', gap:8, marginTop:4, opacity:loading?0.7:1 }}>
              {loading === 'email' ? <Loader2 style={{ width:16, height:16 }} className="animate-spin" /> : <LogIn style={{ width:16, height:16 }} />}
              {loading === 'email' ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <p style={{ fontSize:12, color:'var(--text-muted)', textAlign:'center', marginTop:20 }}>
            Don't have an account?{' '}
            <button onClick={() => { setView('register'); clearErr(); }} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--primary-light)', fontWeight:700, fontSize:12, padding:0 }}>Register</button>
          </p>
        </div>
      </Wrapper>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  VIEW: REGISTER
  // ═══════════════════════════════════════════════════════════════════════════
  if (view === 'register') {
    return (
      <Wrapper>
        <Logo />
        <div style={{ width:'100%', maxWidth:360, background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', padding:'28px 24px', boxShadow:'0 20px 60px rgba(0,0,0,0.35)' }}>
          <button onClick={() => { setView('main'); clearErr(); }} style={{ display:'flex', alignItems:'center', gap:4, background:'none', border:'none', color:'var(--text-muted)', fontSize:12, fontWeight:600, cursor:'pointer', marginBottom:20, padding:0 }}>
            <ArrowLeft style={{ width:14, height:14 }} /> Back
          </button>

          <h2 style={{ fontSize:18, fontWeight:800, color:'var(--text-primary)', marginBottom:20 }}>Create Your Account</h2>

          <form onSubmit={handleRegister} style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div>
              <label style={{ fontSize:11, fontWeight:600, color:'var(--text-muted)', display:'block', marginBottom:5 }}>Full Name</label>
              <input id="input-reg-name" type="text" required autoComplete="name" value={name} onChange={e => setName(e.target.value)} placeholder="Your Name" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:600, color:'var(--text-muted)', display:'block', marginBottom:5 }}>Email Address</label>
              <input id="input-reg-email" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" style={inputStyle} />
            </div>
            <div style={{ position:'relative' }}>
              <label style={{ fontSize:11, fontWeight:600, color:'var(--text-muted)', display:'block', marginBottom:5 }}>Password <span style={{ color:'var(--text-muted)', fontWeight:400 }}>(min. 6 characters)</span></label>
              <input id="input-reg-password" type={showPw ? 'text' : 'password'} required autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Create a password" style={{ ...inputStyle, paddingRight:40 }} />
              <button type="button" onClick={() => setShowPw(v => !v)} style={{ position:'absolute', right:10, bottom:10, background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', padding:0 }}>
                {showPw ? <EyeOff style={{ width:15, height:15 }} /> : <Eye style={{ width:15, height:15 }} />}
              </button>
            </div>

            <ErrorBanner error={error} />

            <button id="btn-register-submit" type="submit" disabled={!!loading} className="btn-primary" style={{ width:'100%', padding:'12px 0', display:'flex', justifyContent:'center', alignItems:'center', gap:8, marginTop:4, opacity:loading?0.7:1 }}>
              {loading === 'register' ? <Loader2 style={{ width:16, height:16 }} className="animate-spin" /> : <UserPlus style={{ width:16, height:16 }} />}
              {loading === 'register' ? 'Creating account…' : 'Create Account'}
            </button>
          </form>

          <p style={{ fontSize:11, color:'var(--text-muted)', textAlign:'center', marginTop:16, lineHeight:1.5 }}>
            Your data is saved <strong style={{ color:'var(--bull)' }}>locally on this device only</strong>.<br />
            No data is sent to any server.
          </p>

          <p style={{ fontSize:12, color:'var(--text-muted)', textAlign:'center', marginTop:12 }}>
            Already have an account?{' '}
            <button onClick={() => { setView('signin'); clearErr(); }} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--primary-light)', fontWeight:700, fontSize:12, padding:0 }}>Sign In</button>
          </p>
        </div>
      </Wrapper>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  VIEW: MAIN (OAuth + Email options)
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <Wrapper>
      <Logo />

      <div style={{ width:'100%', maxWidth:360, background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', padding:'28px 24px', boxShadow:'0 20px 60px rgba(0,0,0,0.35)' }}>

        {/* Firebase not configured notice */}
        {!configured && (
          <div style={{ background:'rgba(91,94,244,0.07)', border:'1px solid rgba(91,94,244,0.2)', borderRadius:'var(--radius-md)', padding:'9px 12px', marginBottom:18, display:'flex', alignItems:'flex-start', gap:8 }}>
            <AlertCircle style={{ width:14, height:14, color:'var(--primary-light)', flexShrink:0, marginTop:1 }} />
            <p style={{ fontSize:11, color:'var(--primary-light)', margin:0, lineHeight:1.5 }}>
              Firebase not configured. <strong>Email/Password and Guest Mode are fully available.</strong>
            </p>
          </div>
        )}

        {/* Google Sign In */}
        {!Capacitor.isNativePlatform() && (
          <>
            <button
              id="btn-google-login"
              onClick={handleGoogle}
              disabled={!!loading || !configured}
              style={{ width:'100%', padding:'13px 16px', borderRadius:'var(--radius-md)', border:'1px solid var(--border)', background: loading==='google' ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.06)', color: configured ? 'var(--text-primary)' : 'var(--text-muted)', display:'flex', alignItems:'center', justifyContent:'center', gap:10, cursor: loading||!configured ? 'not-allowed' : 'pointer', fontSize:14, fontWeight:600, marginBottom:10, transition:'all 0.2s', opacity: !configured ? 0.4 : 1 }}
              onMouseEnter={e => { if (configured && !loading) e.currentTarget.style.background='rgba(255,255,255,0.1)'; }}
              onMouseLeave={e => { e.currentTarget.style.background=loading==='google'?'rgba(255,255,255,0.05)':'rgba(255,255,255,0.06)'; }}
            >
              {loading==='google' ? <Loader2 style={{ width:18, height:18 }} className="animate-spin" /> : <Chrome style={{ width:18, height:18, color:'#EA4335' }} />}
              Continue with Google
            </button>

            {/* Facebook Sign In */}
            <button
              id="btn-facebook-login"
              onClick={handleFacebook}
              disabled={!!loading || !configured}
              style={{ width:'100%', padding:'13px 16px', borderRadius:'var(--radius-md)', border:'1px solid var(--border)', background: loading==='facebook' ? 'rgba(24,119,242,0.1)' : 'rgba(24,119,242,0.07)', color: configured ? '#74a8fb' : 'var(--text-muted)', display:'flex', alignItems:'center', justifyContent:'center', gap:10, cursor: loading||!configured ? 'not-allowed' : 'pointer', fontSize:14, fontWeight:600, marginBottom:18, transition:'all 0.2s', opacity: !configured ? 0.4 : 1 }}
              onMouseEnter={e => { if (configured && !loading) e.currentTarget.style.background='rgba(24,119,242,0.14)'; }}
              onMouseLeave={e => { e.currentTarget.style.background=loading==='facebook'?'rgba(24,119,242,0.1)':'rgba(24,119,242,0.07)'; }}
            >
              {loading==='facebook' ? <Loader2 style={{ width:18, height:18 }} className="animate-spin" /> : <FacebookIcon size={18} />}
              Continue with Facebook
            </button>

            {/* Divider */}
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
              <div style={{ flex:1, height:1, background:'var(--border)' }} />
              <span style={{ fontSize:11, color:'var(--text-muted)', fontWeight:600 }}>OR</span>
              <div style={{ flex:1, height:1, background:'var(--border)' }} />
            </div>
          </>
        )}

        {/* Email sign-in */}
        <button
          id="btn-email-signin"
          onClick={() => { clearErr(); setView('signin'); }}
          disabled={!!loading}
          style={{ width:'100%', padding:'12px 16px', borderRadius:'var(--radius-md)', border:'1px solid rgba(91,94,244,0.35)', background:'rgba(91,94,244,0.08)', color:'var(--primary-light)', display:'flex', alignItems:'center', justifyContent:'center', gap:8, cursor: loading ? 'not-allowed' : 'pointer', fontSize:13, fontWeight:700, marginBottom:10, transition:'all 0.2s' }}
          onMouseEnter={e => { if (!loading) e.currentTarget.style.background='rgba(91,94,244,0.15)'; }}
          onMouseLeave={e => { e.currentTarget.style.background='rgba(91,94,244,0.08)'; }}
        >
          <LogIn style={{ width:16, height:16 }} /> Sign In with Email
        </button>

        {/* Register */}
        <button
          id="btn-email-register"
          onClick={() => { clearErr(); setView('register'); }}
          disabled={!!loading}
          style={{ width:'100%', padding:'12px 16px', borderRadius:'var(--radius-md)', border:'1px solid rgba(91,94,244,0.2)', background:'transparent', color:'var(--text-secondary)', display:'flex', alignItems:'center', justifyContent:'center', gap:8, cursor: loading ? 'not-allowed' : 'pointer', fontSize:13, fontWeight:600, marginBottom:18, transition:'all 0.2s' }}
          onMouseEnter={e => { if (!loading) e.currentTarget.style.background='rgba(255,255,255,0.04)'; }}
          onMouseLeave={e => { e.currentTarget.style.background='transparent'; }}
        >
          <UserPlus style={{ width:16, height:16 }} /> Create New Account
        </button>

        {/* Divider */}
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
          <div style={{ flex:1, height:1, background:'var(--border)' }} />
          <span style={{ fontSize:11, color:'var(--text-muted)', fontWeight:600 }}>QUICK ACCESS</span>
          <div style={{ flex:1, height:1, background:'var(--border)' }} />
        </div>

        {/* Guest */}
        <button
          id="btn-guest-login"
          onClick={handleGuest}
          disabled={!!loading}
          style={{ width:'100%', padding:'11px 16px', borderRadius:'var(--radius-md)', border:'1px dashed rgba(255,255,255,0.15)', background:'transparent', color:'var(--text-muted)', display:'flex', alignItems:'center', justifyContent:'center', gap:8, cursor: loading ? 'not-allowed' : 'pointer', fontSize:12, fontWeight:600, transition:'all 0.2s' }}
          onMouseEnter={e => { if (!loading) e.currentTarget.style.background='rgba(255,255,255,0.04)'; }}
          onMouseLeave={e => { e.currentTarget.style.background='transparent'; }}
        >
          {loading==='guest' ? <Loader2 style={{ width:15, height:15 }} className="animate-spin" /> : <User style={{ width:15, height:15 }} />}
          Continue as Guest (Local Only)
        </button>

        <ErrorBanner />
      </div>

      <p style={{ marginTop:24, fontSize:11, color:'var(--text-muted)', textAlign:'center', lineHeight:1.6, maxWidth:300 }}>
        Email accounts are stored <strong style={{ color:'var(--bull)' }}>only on this device</strong>.<br />
        No financial data is shared with third parties.
      </p>
    </Wrapper>
  );
}

function getFriendlyError(err) {
  const code = err?.code || '';
  if (code === 'auth/popup-closed-by-user') return 'Sign-in popup was closed. Please try again.';
  if (code === 'auth/network-request-failed') return 'Network error. Check your internet connection.';
  if (code === 'auth/account-exists-with-different-credential') return 'An account with this email already exists with a different sign-in method.';
  if (code === 'auth/invalid-api-key' || code === 'auth/app-not-initialized') return 'Firebase is not yet configured. Please use Email or Guest login instead.';
  return err?.message || 'Sign-in failed. Please try again.';
}
