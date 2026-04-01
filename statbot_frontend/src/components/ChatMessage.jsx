// statbot_frontend/src/components/ChatMessage.jsx
// ============================================================
// Renders a single chat message bubble.
// For AI messages it:
//   1. Shows an expandable "Thought Console" with streaming Pandas code + observations
//   2. Auto-detects chart paths in the final answer and renders them as <img> tags
// ============================================================

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Code2, Cpu, User, ChevronDown, ChevronRight, CheckCircle2, Loader2 } from 'lucide-react';

const BACKEND_ORIGIN = 'http://localhost:8000';

// Matches chart filenames from EITHER path style the agent might emit:
//   • Relative:          src/static/charts/foo.png
//   • Absolute Windows:  C:\...\src\static\charts\foo.png   (back- or forward-slash)
// Capture group 1 is always just the bare filename (e.g. "year_distribution.png").
const CHART_FILENAME_RE = /(?:[A-Za-z]:[\\\/][^\n"'`]*[\\\/])?src[\\\/]static[\\\/]charts[\\\/]([\w\-.]+\.png)/g;

/**
 * Splits the agent's final answer into alternating text / chart segments.
 * Uses an exec() loop on a freshly-reset regex to avoid the stateful-lastIndex
 * bug that appears when .test() and .split() share the same RegExp object.
 */
function renderFinalAnswer(text) {
  if (!text) return null;

  const elements = [];
  let lastIndex = 0;
  let match;

  CHART_FILENAME_RE.lastIndex = 0; // always start clean
  while ((match = CHART_FILENAME_RE.exec(text)) !== null) {
    const [fullMatch, filename] = match;
    const matchStart = match.index;

    // Text before the chart path
    if (matchStart > lastIndex) {
      elements.push(
        <span key={`t-${lastIndex}`}>{text.slice(lastIndex, matchStart)}</span>
      );
    }

    // Chart image — always fetch from /static/charts/<filename>
    const imageUrl = `${BACKEND_ORIGIN}/static/charts/${filename}`;
    elements.push(
      <div key={`c-${matchStart}`} style={{ marginTop: '1rem' }}>
        <img
          src={imageUrl}
          alt="Generated chart"
          style={{ width: '100%', borderRadius: '10px', border: '1px solid var(--bg-border)' }}
          onError={(e) => { e.target.style.display = 'none'; }}
        />
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.4rem', textAlign: 'center' }}>
          📊 {filename}
        </p>
      </div>
    );

    lastIndex = matchStart + fullMatch.length;
  }

  // Remaining text after the last chart path (or the whole string if no match)
  if (lastIndex < text.length) {
    elements.push(
      <span key={`t-${lastIndex}`}>{text.slice(lastIndex)}</span>
    );
  }

  return elements.length > 0 ? elements : <span>{text}</span>;
}

export default function ChatMessage({ message }) {
  const isUser = message.sender === 'user';
  // Auto-open the thought console when the first thought arrives
  const [consoleOpen, setConsoleOpen] = useState(false);

  useEffect(() => {
    if (!isUser && message.thoughts && message.thoughts.length > 0 && !message.isDone) {
      setConsoleOpen(true);
    }
  }, [message.thoughts?.length, isUser, message.isDone]);

  const hasThoughts = !isUser && message.thoughts && message.thoughts.length > 0;

  return (
    <div className={`message-wrapper ${isUser ? 'user' : 'ai'}`}>
      {/* Avatar */}
      <div className={`avatar ${isUser ? 'user' : 'ai'}`}>
        {isUser ? <User size={18} /> : <Cpu size={18} />}
      </div>

      <div className="message-content" style={{ flex: 1, minWidth: 0 }}>

        {/* ── Thought Console ──────────────────────────────────── */}
        {hasThoughts && (
          <div className="thought-console">
            <div
              className={`thought-header ${consoleOpen ? 'open' : ''}`}
              onClick={() => setConsoleOpen(o => !o)}
              role="button"
              aria-expanded={consoleOpen}
            >
              <Terminal size={14} />
              <span>
                Thought Process
                <span style={{ marginLeft: '0.4rem', color: 'var(--text-accent)' }}>
                  ({message.thoughts.length} step{message.thoughts.length !== 1 ? 's' : ''})
                </span>
              </span>
              {!message.isDone && (
                <Loader2
                  size={12}
                  style={{ marginLeft: '0.5rem', color: 'var(--text-secondary)', animation: 'spin 1s linear infinite' }}
                />
              )}
              {consoleOpen
                ? <ChevronDown size={14} style={{ marginLeft: 'auto' }} />
                : <ChevronRight size={14} style={{ marginLeft: 'auto' }} />
              }
            </div>

            <AnimatePresence initial={false}>
              {consoleOpen && (
                <motion.div
                  key="thought-body"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22, ease: 'easeInOut' }}
                  style={{ overflow: 'hidden' }}
                >
                  <div className="thought-body">
                    {message.thoughts.map((thought, idx) => (
                      <div key={`${thought.step}-${idx}`} className="thought-step">
                        <div className="step-title">
                          <Code2 size={13} />
                          <span>Step {thought.step} — <em style={{ fontWeight: 400 }}>{thought.action || 'python_repl_ast'}</em></span>
                          {thought.output != null && (
                            <CheckCircle2 size={12} style={{ color: '#10b981', marginLeft: 'auto' }} />
                          )}
                        </div>

                        {thought.input != null && (
                          <div className="code-block">
                            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                              <code>{typeof thought.input === 'object' ? (thought.input.query ?? JSON.stringify(thought.input, null, 2)) : thought.input}</code>
                            </pre>
                          </div>
                        )}

                        {thought.output != null && (
                          <div className="observation">
                            <strong style={{ color: 'var(--text-secondary)' }}>→ Output: </strong>
                            {String(thought.output).slice(0, 500)}{String(thought.output).length > 500 ? '…' : ''}
                          </div>
                        )}

                        {/* Show pulse if we have the thought but no observation yet */}
                        {thought.input != null && thought.output == null && (
                          <div className="typing-indicator" style={{ paddingLeft: '0.5rem', marginTop: '0.5rem' }}>
                            <div className="typing-dot" />
                            <div className="typing-dot" />
                            <div className="typing-dot" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* ── Message Bubble ────────────────────────────────────── */}
        {(message.text || message.isLoading) && (
          <div className="message-bubble">
            {message.isLoading && !message.text ? (
              <div className="typing-indicator">
                <div className="typing-dot" />
                <div className="typing-dot" />
                <div className="typing-dot" />
              </div>
            ) : (
              renderFinalAnswer(message.text)
            )}
          </div>
        )}
      </div>
    </div>
  );
}
