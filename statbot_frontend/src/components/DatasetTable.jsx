// statbot_frontend/src/components/DatasetTable.jsx
// ============================================================
// Displays metadata about the active CSV dataset:
//   - Total rows & columns
//   - Per-column: name + Pandas dtype
// Fetches from GET /api/dataset/info on mount and whenever
// the parent signals a new dataset was uploaded (via the
// `refreshKey` prop being incremented).
// ============================================================

import React, { useState, useEffect } from 'react';
import { Database, RefreshCw, Table2 } from 'lucide-react';

const INFO_URL = 'http://localhost:8000/api/dataset/info';

// Map Pandas dtype strings → friendly labels shown in the table
const DTYPE_LABELS = {
  int64:   { label: 'Integer',  color: '#60a5fa' },
  float64: { label: 'Float',    color: '#34d399' },
  object:  { label: 'Text',     color: '#f472b6' },
  bool:    { label: 'Boolean',  color: '#fbbf24' },
  'datetime64[ns]': { label: 'Datetime', color: '#a78bfa' },
};

function dtype(raw) {
  // Normalise Pandas dtype strings (e.g. "int64", "object")
  const entry = DTYPE_LABELS[raw];
  return entry ?? { label: raw, color: '#a0a0ab' };
}

export default function DatasetTable({ refreshKey = 0 }) {
  const [info, setInfo]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(INFO_URL)
      .then(r => {
        if (!r.ok) throw new Error(`Server returned ${r.status}`);
        return r.json();
      })
      .then(data => {
        if (!cancelled) {
          setInfo(data);
          setLoading(false);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [refreshKey]); // Re-fetch whenever parent uploads a new CSV

  // ── Loading skeleton ────────────────────────────────────────
  if (loading) {
    return (
      <div className="dataset-table-wrapper">
        <div className="dt-header">
          <Database size={14} />
          <span className="dt-title">Dataset Overview</span>
        </div>
        <div className="dt-loading">
          <div className="dt-skeleton" />
          <div className="dt-skeleton dt-skeleton--short" />
          <div className="dt-skeleton" />
        </div>
      </div>
    );
  }

  // ── Error state ─────────────────────────────────────────────
  if (error || !info?.loaded) {
    return (
      <div className="dataset-table-wrapper">
        <div className="dt-header">
          <Database size={14} />
          <span className="dt-title">Dataset Overview</span>
        </div>
        <p className="dt-error">
          {error ?? 'No dataset loaded. Upload a CSV to begin.'}
        </p>
      </div>
    );
  }

  const columns = info.column_names ?? [];
  const dtypes  = info.column_dtypes ?? {};

  return (
    <div className="dataset-table-wrapper">

      {/* ── Header row ───────────────────────────────── */}
      <div className="dt-header">
        <Table2 size={14} />
        <span className="dt-title">{info.filename}</span>
        <div className="dt-badges">
          <span className="dt-badge dt-badge--rows">
            {info.rows.toLocaleString()} rows
          </span>
          <span className="dt-badge dt-badge--cols">
            {info.columns} columns
          </span>
        </div>
      </div>

      {/* ── Schema table ─────────────────────────────── */}
      <div className="dt-scroll">
        <table className="dt-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Column Name</th>
              <th>Data Type</th>
              <th>Sample</th>
            </tr>
          </thead>
          <tbody>
            {columns.map((col, i) => {
              const raw    = dtypes[col] ?? 'object';
              const badge  = dtype(raw);
              return (
                <tr key={col}>
                  <td className="dt-idx">{i + 1}</td>
                  <td className="dt-colname">{col}</td>
                  <td>
                    <span
                      className="dt-dtype-pill"
                      style={{ color: badge.color, borderColor: `${badge.color}40`, background: `${badge.color}14` }}
                    >
                      {badge.label}
                    </span>
                  </td>
                  <td className="dt-sample">
                    {info.sample && info.sample[col] !== undefined
                      ? String(info.sample[col])
                      : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
