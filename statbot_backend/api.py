# statbot_backend/api.py
# ============================================================
# FastAPI application - main entry point for the StatBot Pro API.
# Serves the WebSocket /ws/chat endpoint, static chart/upload files,
# and the new POST /api/upload endpoint for dynamic dataset loading.
# Run with: uvicorn api:app --reload --host 0.0.0.0 --port 8000
# ============================================================

# ── Force headless Matplotlib backend at process start (belt-and-suspenders) ──
# This MUST happen before any other import that might pull in matplotlib.
import matplotlib
matplotlib.use("Agg")

import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from langchain_core.callbacks import AsyncCallbackHandler
from typing import Any, Dict, Union

# Ensure /src is importable from the package root
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from src.config import load_environment, logger
from src.data_ingestion import load_csv_to_dataframe
from src.agent import initialize_agent

# ------------------------------------------------------------------
# Paths
# ------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "src" / "static"
CHARTS_DIR = STATIC_DIR / "charts"
UPLOADS_DIR = STATIC_DIR / "uploads"
DEFAULT_CSV = BASE_DIR / "data" / "sample_data.csv"

# Allowed upload extension (whitelist — only CSV)
ALLOWED_EXTENSION = ".csv"
MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB hard cap


# ------------------------------------------------------------------
# Lifespan context manager (replaces deprecated @app.on_event)
# ------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load CSV data once at startup and make it available globally."""
    logger.info("StatBot Pro API starting up...")
    load_environment()

    # Ensure storage directories exist with correct permissions
    CHARTS_DIR.mkdir(parents=True, exist_ok=True)
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    logger.info(f"Storage dirs ready → charts: {CHARTS_DIR} | uploads: {UPLOADS_DIR}")

    # Load the default dataset; uploads will overwrite app.state.df at runtime
    app.state.active_csv_path = str(DEFAULT_CSV)
    app.state.df = load_csv_to_dataframe(str(DEFAULT_CSV))

    if app.state.df is not None:
        logger.info(
            f"Default dataset loaded: {app.state.df.shape[0]} rows × "
            f"{app.state.df.shape[1]} cols from {DEFAULT_CSV.name}"
        )
    else:
        logger.error("Failed to load sample_data.csv — agent will be unavailable until a CSV is uploaded.")

    yield  # Application runs here

    logger.info("StatBot Pro API shutting down.")


# ------------------------------------------------------------------
# FastAPI App
# ------------------------------------------------------------------
app = FastAPI(title="StatBot Pro API", version="5.0.0", lifespan=lifespan)

# CORS — allow React dev server on any localhost port
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount /static so charts and uploads are reachable:
#   http://localhost:8000/static/charts/<file>.png
#   http://localhost:8000/static/uploads/<file>.csv
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


# ------------------------------------------------------------------
# WebSocket Streaming Callback Handler
# ------------------------------------------------------------------
class AgentStreamingCallback(AsyncCallbackHandler):
    """
    Intercepts LangChain Pandas Agent tool calls and streams them
    in real-time over the WebSocket connection.

    Message schema sent to frontend:
      { type: "thought",     step: int, action: str, input: str }
      { type: "observation", step: int, output: str }
      { type: "final",       output: str }
      { type: "error",       message: str }
    """

    def __init__(self, websocket: WebSocket):
        self.websocket = websocket
        self.tool_count = 0

    async def on_tool_start(
        self,
        serialized: Dict[str, Any],
        input_str: str,
        **kwargs: Any,
    ) -> None:
        """Fired just before the Python REPL tool executes the agent's generated code."""
        self.tool_count += 1
        tool_name = serialized.get("name", "python_repl_ast")

        await self.websocket.send_json({
            "type": "thought",
            "step": self.tool_count,
            "action": tool_name,
            "input": str(input_str),
        })

    async def on_tool_end(
        self,
        output: str,
        **kwargs: Any,
    ) -> None:
        """Fired after the REPL returns its stdout / result."""
        await self.websocket.send_json({
            "type": "observation",
            "step": self.tool_count,
            "output": str(output),
        })

    async def on_tool_error(
        self,
        error: Union[Exception, KeyboardInterrupt],
        **kwargs: Any,
    ) -> None:
        """Propagate tool errors gracefully to the frontend."""
        await self.websocket.send_json({
            "type": "observation",
            "step": self.tool_count,
            "output": f"[Tool Error] {str(error)}",
        })


# ------------------------------------------------------------------
# CSV Upload Endpoint
# ------------------------------------------------------------------
@app.post("/api/upload")
async def upload_csv(file: UploadFile = File(...)):
    """
    Accepts a CSV file upload, validates it, persists it to
    src/static/uploads/, then hot-swaps the active dataset so
    the LangChain agent immediately uses the new data.

    Returns:
        200: { status, filename, rows, columns, message }
        400: { detail } if file is not a .csv or is empty/corrupt
    """
    # ── 1. Extension whitelist ─────────────────────────────────
    original_filename = file.filename or "upload.csv"
    file_ext = Path(original_filename).suffix.lower()

    if file_ext != ALLOWED_EXTENSION:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type '{file_ext}'. Only .csv files are accepted.",
        )

    # ── 2. Sanitise filename (no path traversal) ───────────────
    safe_name = Path(original_filename).name  # strips any directory components
    dest_path = UPLOADS_DIR / safe_name

    # ── 3. Stream to disk with a size cap ─────────────────────
    logger.info(f"Receiving upload: {safe_name}")
    try:
        with dest_path.open("wb") as buffer:
            bytes_written = 0
            while chunk := await file.read(65_536):  # 64 KB chunks
                bytes_written += len(chunk)
                if bytes_written > MAX_UPLOAD_BYTES:
                    dest_path.unlink(missing_ok=True)
                    raise HTTPException(
                        status_code=413,
                        detail="File exceeds the 50 MB upload limit.",
                    )
                buffer.write(chunk)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"File write error: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Could not save file: {exc}")

    # ── 4. Parse CSV and validate ──────────────────────────────
    df = load_csv_to_dataframe(str(dest_path))
    if df is None:
        dest_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=400,
            detail="The uploaded file could not be parsed as a valid CSV.",
        )

    # ── 5. Hot-swap active dataset (thread-safe for asyncio) ───
    app.state.df = df
    app.state.active_csv_path = str(dest_path)

    logger.info(
        f"Dataset swapped → {safe_name} "
        f"({df.shape[0]} rows × {df.shape[1]} cols)"
    )

    return {
        "status": "success",
        "filename": safe_name,
        "rows": int(df.shape[0]),
        "columns": int(df.shape[1]),
        "column_names": df.columns.tolist(),
        "message": f"Dataset '{safe_name}' loaded successfully. The agent is ready.",
    }


# ------------------------------------------------------------------
# Dataset Info Endpoint (used by frontend status badge)
# ------------------------------------------------------------------
@app.get("/api/dataset/info")
async def dataset_info():
    """
    Returns full metadata about the currently active dataset.
    Used by the DatasetTable component on the frontend.
    """
    df = getattr(app.state, "df", None)
    csv_path = getattr(app.state, "active_csv_path", None)
    filename = Path(csv_path).name if csv_path else "none"

    if df is None:
        return {
            "loaded": False,
            "filename": filename,
            "rows": 0,
            "columns": 0,
            "column_names": [],
            "column_dtypes": {},
            "sample": {},
        }

    # Build dtype map: { col_name: dtype_string }
    column_dtypes = {col: str(df[col].dtype) for col in df.columns}

    # First non-null row as a preview (JSON-safe — stringify everything)
    sample = {}
    if len(df) > 0:
        first_row = df.iloc[0]
        for col in df.columns:
            val = first_row[col]
            sample[col] = str(val) if val is not None else "—"

    return {
        "loaded": True,
        "filename": filename,
        "rows": int(df.shape[0]),
        "columns": int(df.shape[1]),
        "column_names": df.columns.tolist(),
        "column_dtypes": column_dtypes,
        "sample": sample,
    }


# ------------------------------------------------------------------
# WebSocket Chat Endpoint
# ------------------------------------------------------------------
@app.websocket("/ws/chat")
async def websocket_chat_endpoint(websocket: WebSocket):
    """
    Bi-directional WebSocket endpoint.
    - Receives: plain text query from the React frontend
    - Sends:    streaming thought/observation JSON frames + final answer
    """
    await websocket.accept()
    logger.info("New WebSocket client connected.")

    if app.state.df is None:
        await websocket.send_json({
            "type": "error",
            "message": "No dataset loaded. Please upload a CSV file first.",
        })
        await websocket.close()
        return

    # Snapshot the current DataFrame for this session
    session_df = app.state.df
    agent_executor = initialize_agent(df=session_df)

    try:
        while True:
            query = await websocket.receive_text()
            logger.info(f"WS Query received: {query!r}")

            streaming_handler = AgentStreamingCallback(websocket)

            try:
                response = await agent_executor.ainvoke(
                    {"input": query},
                    config={"callbacks": [streaming_handler]},
                )

                final_answer = response.get("output", "I could not generate an answer.")

                # ── Catch the LangChain "I now know the final answer" output-parsing bug ──
                # When the model responds with a human-like prefix instead of the ReAct
                # "Final Answer:" format, LangChain raises a ValueError at the executor
                # level. The agent will have already retried internally, but if it still
                # leaks here we surface a clean message instead of crashing the session.
                if isinstance(final_answer, str) and "output parsing error" in final_answer.lower():
                    final_answer = (
                        "The agent completed the task but encountered a formatting issue. "
                        "Please rephrase your question or try again."
                    )

                await websocket.send_json({
                    "type": "final",
                    "output": final_answer,
                })

            except ValueError as exc:
                # Output-parsing failures from LangChain's ReAct parser
                err_str = str(exc)
                logger.warning(f"Agent output parsing error (non-fatal): {err_str}")
                if "output parsing error" in err_str.lower() or "could not parse" in err_str.lower():
                    await websocket.send_json({
                        "type": "final",
                        "output": (
                            "The agent completed the task but produced output in an unexpected format. "
                            "The operation likely succeeded — please check the charts panel or rephrase your question."
                        ),
                    })
                else:
                    await websocket.send_json({
                        "type": "error",
                        "message": err_str,
                    })

            except Exception as exc:
                logger.error(f"Agent execution error: {exc}", exc_info=True)
                await websocket.send_json({
                    "type": "error",
                    "message": str(exc),
                })

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected.")



# ------------------------------------------------------------------
# Health Check
# ------------------------------------------------------------------
@app.get("/health")
async def health():
    df = getattr(app.state, "df", None)
    csv_path = getattr(app.state, "active_csv_path", None)
    return {
        "status": "ok",
        "dataset_loaded": df is not None,
        "active_file": Path(csv_path).name if csv_path else None,
        "rows": int(df.shape[0]) if df is not None else 0,
    }


# ------------------------------------------------------------------
# Entrypoint (for direct python api.py invocation)
# ------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True)
