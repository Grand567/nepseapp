import React, { useState, useEffect, useRef } from 'react';
import { Calendar, ChevronDown, Check } from 'lucide-react';

/**
 * Universal Dark-Themed Session Date Dropdown
 * -------------------------------------------
 * Replaces native <select> and <input type="date"> pickers across the app.
 * Completely immune to Android native white alert dialogs and system light-mode overrides.
 */
export function SessionDateDropdown({
  selectedSessionDate: propSelectedSessionDate,
  value,
  onSelectDate,
  onChange,
  availableDates = [],
  label = '',
  latestLabel: propLatestLabel,
  placeholder,
  align = 'right',
  style = {},
  buttonStyle = {},
  compact = false,
}) {
  const selectedSessionDate = propSelectedSessionDate !== undefined ? propSelectedSessionDate : (value || '');
  const handleSelect = onSelectDate || onChange;
  const latestLabel = propLatestLabel || placeholder || 'Latest Session';
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  const cleanDates = Array.from(new Set(availableDates || [])).filter(Boolean);

  return (
    <div ref={dropdownRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', ...style }}>
      {label && (
        <span style={{ fontSize: compact ? 10 : 11, color: '#94a3b8', fontWeight: 700, marginRight: 6 }}>
          {label}
        </span>
      )}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: selectedSessionDate ? 'rgba(56, 189, 248, 0.14)' : 'rgba(255, 255, 255, 0.06)',
          border: selectedSessionDate ? '1px solid rgba(56, 189, 248, 0.45)' : '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: 8,
          padding: compact ? '3px 7px' : '4px 9px',
          color: selectedSessionDate ? '#38bdf8' : '#e2e8f0',
          fontSize: compact ? 10.5 : 11,
          fontWeight: 800,
          cursor: 'pointer',
          outline: 'none',
          whiteSpace: 'nowrap',
          transition: 'all 0.15s ease',
          ...buttonStyle,
        }}
        title={selectedSessionDate ? `Filtered to session ${selectedSessionDate}` : latestLabel}
      >
        <Calendar size={compact ? 11 : 12} color={selectedSessionDate ? '#38bdf8' : '#94a3b8'} />
        <span>{selectedSessionDate || latestLabel}</span>
        <ChevronDown
          size={compact ? 10 : 11}
          color={selectedSessionDate ? '#38bdf8' : '#94a3b8'}
          style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
        />
      </button>

      {selectedSessionDate && (
        <button
          type="button"
          onClick={() => handleSelect?.('')}
          style={{
            background: 'none',
            border: 'none',
            color: '#f43f5e',
            fontSize: 12,
            fontWeight: 900,
            cursor: 'pointer',
            padding: '2px 4px',
            marginLeft: 2,
          }}
          title="Reset to Latest Session"
        >
          ×
        </button>
      )}

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            [align === 'left' ? 'left' : 'right']: 0,
            zIndex: 99999,
            minWidth: 230,
            maxHeight: 280,
            overflowY: 'auto',
            background: '#0B0E14',
            border: '1px solid rgba(255, 255, 255, 0.16)',
            borderRadius: 12,
            boxShadow: '0 16px 36px rgba(0, 0, 0, 0.85)',
            padding: 6,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <div style={{ padding: '6px 10px', fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Select Trading Session
          </div>
          <button
            type="button"
            onClick={() => { handleSelect?.(''); setIsOpen(false); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 10px',
              borderRadius: 8,
              background: !selectedSessionDate ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
              color: !selectedSessionDate ? '#38bdf8' : '#e2e8f0',
              border: 'none',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              textAlign: 'left',
              width: '100%',
            }}
          >
            <span>{latestLabel}</span>
            {!selectedSessionDate && <Check size={14} color="#38bdf8" />}
          </button>
          {cleanDates.map((dt) => {
            const isSelected = selectedSessionDate === dt;
            return (
              <button
                key={dt}
                type="button"
                onClick={() => { handleSelect?.(dt); setIsOpen(false); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '7px 10px',
                  borderRadius: 8,
                  background: isSelected ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                  color: isSelected ? '#38bdf8' : '#cbd5e1',
                  border: 'none',
                  fontSize: 12,
                  fontFamily: 'monospace',
                  fontWeight: isSelected ? 800 : 600,
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%',
                }}
              >
                <span>{dt}</span>
                {isSelected && <Check size={14} color="#38bdf8" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default SessionDateDropdown;
