import React from 'react';

export class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', textAlign: 'left', color: '#fff', background: 'var(--bg-dark)', height: '100%', overflowY: 'auto' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--bear)' }}>Something went wrong</h2>
          <p style={{ fontSize: '13px', opacity: 0.8, marginTop: '8px' }}>Failed to load this module. The application caught a crash.</p>
          
          <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(255,0,0,0.1)', border: '1px solid var(--bear)', borderRadius: '8px', fontSize: '11px', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            <strong style={{color:'var(--bear)', fontSize:'13px'}}>{this.state.error?.toString()}</strong>
            <br/><br/>
            {this.state.error?.stack}
          </div>

          <button 
            onClick={() => this.setState({ hasError: false, error: null })} 
            style={{ marginTop: '20px', padding: '10px 20px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', width: '100%' }}
          >
            Retry Render
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
