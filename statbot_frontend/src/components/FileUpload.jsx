// statbot_frontend/src/components/FileUpload.jsx
// ============================================================
// Drag-and-drop / click-to-browse CSV uploader.
// Calls POST /api/upload, shows progress, success & error states.
// Props:
//   onDatasetChange(info) — called with { filename, rows, columns, column_names }
//                           after a successful upload so App can refresh state.
// ============================================================

import React, { useState, useRef, useCallback } from 'react';
import { Upload, FileText, CheckCircle, XCircle, Loader } from 'lucide-react';

const UPLOAD_URL = 'http://localhost:8000/api/upload';

// Upload state machine values
const STATE = {
  IDLE:       'idle',
  DRAGGING:   'dragging',
  UPLOADING:  'uploading',
  SUCCESS:    'success',
  ERROR:      'error',
};

export default function FileUpload({ onDatasetChange }) {
  const [uploadState, setUploadState] = useState(STATE.IDLE);
  const [selectedFile, setSelectedFile] = useState(null);
  const [result, setResult]   = useState(null);   // success payload
  const [errorMsg, setErrorMsg] = useState('');
  const [progress, setProgress] = useState(0);

  const inputRef = useRef(null);

  // ── Validation ────────────────────────────────────────────
  const validateFile = (file) => {
    if (!file) return 'No file selected.';
    if (!file.name.toLowerCase().endsWith('.csv'))
      return `"${file.name}" is not a CSV file. Only .csv files are accepted.`;
    if (file.size > 50 * 1024 * 1024)
      return 'File exceeds the 50 MB upload limit.';
    return null;
  };

  // ── Core upload logic ─────────────────────────────────────
  const uploadFile = useCallback(async (file) => {
    const validationError = validateFile(file);
    if (validationError) {
      setErrorMsg(validationError);
      setUploadState(STATE.ERROR);
      return;
    }

    setUploadState(STATE.UPLOADING);
    setProgress(0);
    setResult(null);
    setErrorMsg('');

    // Simulate indeterminate progress while fetching
    const progressInterval = setInterval(() => {
      setProgress((p) => Math.min(p + Math.random() * 15, 88));
    }, 200);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(UPLOAD_URL, {
        method: 'POST',
        body: formData,
        // NOTE: Do NOT set Content-Type — the browser sets the correct
        // multipart/form-data boundary automatically.
      });

      clearInterval(progressInterval);
      setProgress(100);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || `Server error: ${response.status}`);
      }

      setResult(data);
      setUploadState(STATE.SUCCESS);
      onDatasetChange?.({
        filename:     data.filename,
        rows:         data.rows,
        columns:      data.columns,
        column_names: data.column_names,
      });

    } catch (err) {
      clearInterval(progressInterval);
      setProgress(0);
      setErrorMsg(err.message || 'An unknown error occurred.');
      setUploadState(STATE.ERROR);
    }
  }, [onDatasetChange]);

  // ── File selection handlers ────────────────────────────────
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      uploadFile(file);
    }
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setUploadState(STATE.IDLE);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setSelectedFile(file);
      uploadFile(file);
    }
  }, [uploadFile]);

  const handleDragOver = (e) => {
    e.preventDefault();
    setUploadState(STATE.DRAGGING);
  };

  const handleDragLeave = () => {
    if (uploadState === STATE.DRAGGING) setUploadState(STATE.IDLE);
  };

  const handleReset = () => {
    setUploadState(STATE.IDLE);
    setSelectedFile(null);
    setResult(null);
    setErrorMsg('');
    setProgress(0);
    if (inputRef.current) inputRef.current.value = '';
  };

  // ── Derived visual state ──────────────────────────────────
  const isDragging   = uploadState === STATE.DRAGGING;
  const isUploading  = uploadState === STATE.UPLOADING;
  const isSuccess    = uploadState === STATE.SUCCESS;
  const isError      = uploadState === STATE.ERROR;

  return (
    <div className="file-upload-wrapper">

      {/* ── Drop Zone ─────────────────────────────────────── */}
      {!isSuccess && (
        <div
          className={`drop-zone ${isDragging ? 'dragging' : ''} ${isError ? 'error-zone' : ''}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => !isUploading && inputRef.current?.click()}
          role="button"
          tabIndex={0}
          aria-label="Upload CSV file"
          onKeyDown={(e) => e.key === 'Enter' && !isUploading && inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            id="csv-file-input"
            type="file"
            accept=".csv"
            style={{ display: 'none' }}
            onChange={handleFileChange}
            disabled={isUploading}
          />

          {/* Icon */}
          <div className={`drop-icon ${isDragging ? 'drop-icon--active' : ''}`}>
            {isUploading ? (
              <Loader size={24} className="spin-icon" />
            ) : isError ? (
              <XCircle size={24} color="#ef4444" />
            ) : (
              <Upload size={24} />
            )}
          </div>

          {/* Text */}
          {isUploading ? (
            <div className="drop-text">
              <p className="drop-primary">Uploading <strong>{selectedFile?.name}</strong>…</p>
              <div className="progress-bar-track">
                <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
              </div>
              <p className="drop-secondary">{Math.round(progress)}%</p>
            </div>
          ) : isError ? (
            <div className="drop-text">
              <p className="drop-primary error-text">{errorMsg}</p>
              <p className="drop-secondary" style={{ marginTop: '0.5rem' }}>
                Click or drag to try again
              </p>
            </div>
          ) : (
            <div className="drop-text">
              <p className="drop-primary">
                {isDragging ? 'Drop your CSV here' : 'Drag & drop a CSV file'}
              </p>
              <p className="drop-secondary">or <span className="link-text">click to browse</span></p>
              <p className="drop-hint">Max 50 MB · .csv only</p>
            </div>
          )}
        </div>
      )}

      {/* ── Success Banner ────────────────────────────────── */}
      {isSuccess && result && (
        <div className="upload-success-card">
          <div className="success-header">
            <CheckCircle size={20} color="#10b981" />
            <span className="success-title">Dataset Loaded Successfully</span>
            <button className="reset-button" onClick={handleReset} title="Upload a different file">
              ↺ Change
            </button>
          </div>

          <div className="success-meta">
            <div className="meta-chip">
              <FileText size={13} />
              <span>{result.filename}</span>
            </div>
            <div className="meta-chip">
              <span>{result.rows.toLocaleString()} rows</span>
            </div>
            <div className="meta-chip">
              <span>{result.columns} columns</span>
            </div>
          </div>

          {result.column_names?.length > 0 && (
            <div className="column-pills">
              {result.column_names.slice(0, 8).map((col) => (
                <span key={col} className="column-pill">{col}</span>
              ))}
              {result.column_names.length > 8 && (
                <span className="column-pill column-pill--more">
                  +{result.column_names.length - 8} more
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
