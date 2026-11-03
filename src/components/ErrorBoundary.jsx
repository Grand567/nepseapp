import React from 'react';

export class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error(`[ErrorBoundary${this.props.moduleName ? ` - ${this.props.moduleName}` : ''}] caught:`, error, errorInfo);
  }

  componentDidUpdate(prevProps) {
    // Automatically reset error boundary if activeTab, module, or resetKey changes
    if (this.state.hasError && (
      prevProps.activeTab !== this.props.activeTab ||
      prevProps.resetKey !== this.props.resetKey ||
      prevProps.moduleName !== this.props.moduleName
    )) {
      this.setState({ hasError: false, error: null });
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (typeof this.props.onReset === 'function') {
      try { this.props.onReset(); } catch (_) {}
    }
  };

  render() {
    if (this.state.hasError) {
      const moduleName = this.props.moduleName || 'Module';
      return (
        <div style={{
          padding: '24px 20px',
          textAlign: 'left',
          color: '#f8fafc',
          background: 'rgba(15, 23, 42, 0.95)',
          borderRadius: 16,
          margin: '12px',
          border: '1.5px solid rgba(244, 63, 94, 0.4)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          overflowY: 'auto'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 22 }}>⚠️</span>
            <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: '#f87171', margin: 0 }}>
              {moduleName} Telemetry Notice
            </h2>
          </div>
          <p style={{ fontSize: '13px', color: '#94a3b8', margin: '4px 0 14px 0', lineHeight: 1.5 }}>
            An unexpected render issue was safely caught in {moduleName}. Other tabs and live market feeds remain unaffected.
          </p>
          
          <div style={{
            padding: '12px 14px',
            background: 'rgba(0, 0, 0, 0.4)',
            border: '1px solid rgba(244, 63, 94, 0.25)',
            borderRadius: '10px',
            fontSize: 11.5,
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            maxHeight: 140,
            overflowY: 'auto',
            color: '#fca5a5'
          }}>
            <strong>{this.state.error?.toString()}</strong>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: '16px', flexWrap: 'wrap' }}>
            <button 
              onClick={this.handleReset}
              style={{
                flex: 1,
                minWidth: 140,
                padding: '10px 16px',
                background: '#3b82f6',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '13px'
              }}
            >
              🔄 Retry Render
            </button>
            {this.props.onNavigateDashboard && (
              <button 
                onClick={this.props.onNavigateDashboard}
                style={{
                  flex: 1,
                  minWidth: 140,
                  padding: '10px 16px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  color: '#cbd5e1',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '13px'
                }}
              >
                🏠 Return to Market
              </button>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
