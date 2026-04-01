// statbot_frontend/src/App.jsx
// ============================================================
// Root application component.
// Manages WebSocket lifecycle, message state, and renders the Chat UI.
// Now includes collapsible FileUpload panel for dynamic dataset loading.
// ============================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, BarChart2, Wifi, WifiOff, RefreshCw, Upload, X, Database } from 'lucide-react';
import ChatMessage from './components/ChatMessage';
import FileUpload from './components/FileUpload';
import DatasetTable from './components/DatasetTable';

const WS_URL = 'ws://localhost:8000/ws/chat';

// Default suggestion chips — overridden after a dataset is uploaded
const DEFAULT_SUGGESTIONS = [
  'How many rows are in the dataset?',
  'What are the column names?',
  'Plot sales over time with a 3-month rolling average.',
  'What is the mean value of the Revenue column?',
];

export default function App() {
  const [messages, setMessages]       = useState([]);
  const [inputVal, setInputVal]       = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [wsError, setWsError]         = useState(false);
  const [showUpload, setShowUpload]   = useState(false);
  const [datasetInfo, setDatasetInfo] = useState(null); // { filename, rows, columns }
  const [suggestions, setSuggestions] = useState(DEFAULT_SUGGESTIONS);
  const [tableRefreshKey, setTableRefreshKey] = useState(0); // Incremented after each upload

  const wsRef          = useRef(null);
  const messagesEndRef = useRef(null);
  const inputRef       = useRef(null);

  // Auto-scroll to the latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── WebSocket setup ─────────────────────────────────────────
  const connectWs = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState < 2) return;

    setWsError(false);
    const ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      setIsConnected(true);
      setWsError(false);
    };

    ws.onmessage = (event) => {
      let data;
      try { data = JSON.parse(event.data); }
      catch { return; }

      setMessages((prev) => {
        if (prev.length === 0) return prev;

        const lastIdx = prev.length - 1;
        const last = prev[lastIdx];
        if (last.sender !== 'ai') return prev;

        const aiMsg = {
          ...last,
          thoughts: last.thoughts ? last.thoughts.map(t => ({ ...t })) : [],
        };

        switch (data.type) {
          case 'thought': {
            const idx = aiMsg.thoughts.findIndex(t => t.step === data.step);
            const entry = { step: data.step, action: data.action, input: data.input };
            if (idx > -1) aiMsg.thoughts[idx] = { ...aiMsg.thoughts[idx], ...entry };
            else aiMsg.thoughts.push(entry);
            break;
          }
          case 'observation': {
            const idx = aiMsg.thoughts.findIndex(t => t.step === data.step);
            if (idx > -1) aiMsg.thoughts[idx] = { ...aiMsg.thoughts[idx], output: data.output };
            else aiMsg.thoughts.push({ step: data.step, output: data.output });
            break;
          }
          case 'final':
            aiMsg.text = data.output;
            aiMsg.isDone = true;
            aiMsg.isLoading = false;
            setIsProcessing(false);
            break;
          case 'error':
            aiMsg.text = `⚠️ ${data.message}`;
            aiMsg.isDone = true;
            aiMsg.isLoading = false;
            setIsProcessing(false);
            break;
          default:
            break;
        }

        const newMsgs = [...prev];
        newMsgs[lastIdx] = aiMsg;
        return newMsgs;
      });
    };

    ws.onclose = () => {
      setIsConnected(false);
      setIsProcessing(false);
    };

    ws.onerror = () => {
      setIsConnected(false);
      setWsError(true);
      setIsProcessing(false);
    };

    wsRef.current = ws;
  }, []);

  useEffect(() => {
    connectWs();
    return () => wsRef.current?.close();
  }, [connectWs]);

  // ── Dataset change callback from FileUpload ─────────────────
  const handleDatasetChange = useCallback((info) => {
    setDatasetInfo(info);
    setShowUpload(false); // collapse the panel after success
    setTableRefreshKey(k => k + 1); // trigger DatasetTable re-fetch

    // Generate contextual suggestion chips from the uploaded columns
    const cols = info.column_names?.slice(0, 3) ?? [];
    const dynamic = cols.length >= 2
      ? [
          `How many rows are in ${info.filename}?`,
          `What are all the column names?`,
          cols[0] ? `Show me the distribution of ${cols[0]}` : 'Describe the dataset',
          cols[1] ? `Plot ${cols[0]} vs ${cols[1]}` : 'What is the mean of each numeric column?',
        ]
      : DEFAULT_SUGGESTIONS;
    setSuggestions(dynamic);

    // Reconnect WebSocket so the new session picks up the swapped df
    if (wsRef.current) wsRef.current.close();
    setTimeout(connectWs, 300);
  }, [connectWs]);

  // ── Send a message ──────────────────────────────────────────
  const sendMessage = useCallback((query) => {
    if (!query.trim() || !isConnected || isProcessing) return;

    setMessages(prev => [
      ...prev,
      { sender: 'user', text: query.trim() },
      { sender: 'ai', text: '', thoughts: [], isLoading: true, isDone: false },
    ]);
    setIsProcessing(true);
    wsRef.current.send(query.trim());
    setInputVal('');
    inputRef.current?.focus();
  }, [isConnected, isProcessing]);

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage(inputVal);
  };

  const handleSuggestion = (text) => sendMessage(text);

  // ── Render ──────────────────────────────────────────────────
  return (
    <div className="chat-container glass-panel">

      {/* ── Header ──────────────────────────────────── */}
      <header className="app-header">
        <div className="brand-logo">
          <BarChart2 size={18} color="#fff" strokeWidth={2.5} />
        </div>
        <div>
          <h1 className="brand-title">StatBot Pro</h1>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '1px' }}>
            {datasetInfo
              ? `Analysing: ${datasetInfo.filename} · ${datasetInfo.rows.toLocaleString()} rows`
              : 'AI-Powered Data Analyst · Groq + LangChain'}
          </p>
        </div>

        {/* Dataset badge */}
        {datasetInfo && (
          <div className="dataset-badge">
            <Database size={11} />
            <span>{datasetInfo.columns} cols</span>
          </div>
        )}

        {/* Upload toggle button */}
        <button
          id="upload-toggle-button"
          className={`upload-toggle-btn ${showUpload ? 'active' : ''}`}
          onClick={() => setShowUpload(v => !v)}
          title={showUpload ? 'Close upload panel' : 'Upload a CSV dataset'}
        >
          {showUpload ? <X size={14} /> : <Upload size={14} />}
          <span>{showUpload ? 'Close' : 'Upload CSV'}</span>
        </button>

        {/* WS Status */}
        <div className="status-indicator">
          {wsError ? (
            <>
              <WifiOff size={14} style={{ color: '#ef4444' }} />
              <span style={{ color: '#ef4444' }}>Disconnected</span>
              <button
                onClick={connectWs}
                title="Reconnect"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem' }}
              >
                <RefreshCw size={13} /> Retry
              </button>
            </>
          ) : (
            <>
              <div className={`status-dot ${isConnected ? 'connected' : ''}`} />
              {isConnected
                ? <span style={{ color: '#10b981' }}>Connected</span>
                : <span>Connecting…</span>}
            </>
          )}
        </div>
      </header>

      {/* ── Upload Panel (collapsible) ───────────────── */}
      {showUpload && (
        <div className="upload-panel">
          <FileUpload onDatasetChange={handleDatasetChange} />
        </div>
      )}

      {/* ── Messages ────────────────────────────────── */}
      <main className="messages-area">
        {messages.length === 0 ? (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2rem', padding: '1.5rem 0' }}>

            {/* ── Dataset Schema Table ───────────────── */}
            <DatasetTable refreshKey={tableRefreshKey} />

            {/* ── Welcome hero ─────────────────────── */}
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '0 2rem' }}>
              <div className="brand-logo" style={{ margin: '0 auto 1.5rem auto', width: 56, height: 56, borderRadius: 16 }}>
                <BarChart2 size={28} color="#fff" />
              </div>
              <h2 className="brand-font" style={{ fontSize: '1.6rem', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                Welcome to StatBot Pro
              </h2>
              <p style={{ fontSize: '0.9rem', maxWidth: 400, margin: '0 auto 2rem auto', lineHeight: 1.6 }}>
                {datasetInfo
                  ? `${datasetInfo.filename} is loaded and ready. Ask anything about your data.`
                  : 'Upload a CSV or ask questions about the default dataset. The agent will explain its reasoning step by step.'}
              </p>

              {/* Suggestion chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'center' }}>
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => handleSuggestion(s)}
                    disabled={!isConnected || isProcessing}
                    style={{
                      background: 'var(--agent-bubble)',
                      border: '1px solid var(--bg-border)',
                      borderRadius: 20,
                      padding: '0.5rem 1rem',
                      color: 'var(--text-primary)',
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={e => e.target.style.borderColor = 'rgba(99,102,241,0.5)'}
                    onMouseLeave={e => e.target.style.borderColor = 'var(--bg-border)'}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          messages.map((msg, index) => (
            <ChatMessage key={index} message={msg} />
          ))
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* ── Input ───────────────────────────────────── */}
      <div className="input-area">
        {isProcessing && (
          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '0.5rem' }}>
            Agent is thinking… check the Thought Console above for live progress
          </p>
        )}
        <form className="input-box" onSubmit={handleSubmit} id="chat-form">
          <input
            ref={inputRef}
            id="chat-input"
            type="text"
            className="chat-input"
            placeholder={isConnected ? 'Ask anything about the data…' : 'Waiting for backend connection…'}
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            disabled={!isConnected || isProcessing}
            autoComplete="off"
          />
          <button
            id="send-button"
            type="submit"
            className="send-button"
            disabled={!inputVal.trim() || !isConnected || isProcessing}
            title="Send"
          >
            <Send size={17} />
          </button>
        </form>
      </div>
    </div>
  );
}
