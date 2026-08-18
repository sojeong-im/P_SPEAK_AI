'use client';

import { useState, useEffect } from 'react';

export default function PasswordProtection({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const auth = sessionStorage.getItem('site_auth');
    if (auth === 'true') {
      setIsAuthenticated(true);
    }
  }, []);

  if (!isMounted) return null;

  if (isAuthenticated) {
    return <>{children}</>;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === '00347') {
      setIsAuthenticated(true);
      sessionStorage.setItem('site_auth', 'true');
      setError(false);
    } else {
      setError(true);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: '#F7FAF9', zIndex: 9999, fontFamily: 'Pretendard, sans-serif'
    }}>
      <div style={{
        background: 'white', padding: '2rem', borderRadius: '1rem',
        boxShadow: '0 10px 25px rgba(0,0,0,0.05)', textAlign: 'center',
        maxWidth: '400px', width: '90%'
      }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1.5rem', color: '#111827' }}>
          관리자 번호를 입력해주세요
        </h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호"
            style={{
              padding: '0.875rem', borderRadius: '0.5rem', border: '1px solid #E5E7EB',
              outline: 'none', fontSize: '1rem', width: '100%', boxSizing: 'border-box',
              textAlign: 'center', letterSpacing: '0.2em'
            }}
            autoFocus
          />
          {error && <p style={{ color: '#EF4444', fontSize: '0.875rem', margin: 0 }}>비밀번호가 일치하지 않습니다.</p>}
          <button
            type="submit"
            style={{
              backgroundColor: '#00C9A7', color: 'white', padding: '0.875rem',
              borderRadius: '0.5rem', border: 'none', fontWeight: 'bold',
              cursor: 'pointer', fontSize: '1rem', transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#00B396'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#00C9A7'; }}
          >
            확인
          </button>
        </form>
      </div>
    </div>
  );
}
