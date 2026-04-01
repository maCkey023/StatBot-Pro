# statbot_backend/src/agent.py
import os
import logging
import pandas as pd
from pathlib import Path

# ─── CRITICAL: Force headless Matplotlib backend BEFORE any other matplotlib import ───
# This must happen before any other matplotlib/pyplot import anywhere in the process.
# Without this, Matplotlib tries to spin up a Tkinter GUI, which raises
# "RuntimeError: main thread is not in main loop" in uvicorn's asyncio threads.
import matplotlib
matplotlib.use("Agg")

from langchain_experimental.agents import create_pandas_dataframe_agent
from langchain_groq import ChatGroq

logger = logging.getLogger(__name__)

# Absolute path to the charts directory — injected into the agent prompt
# so savefig() always resolves correctly regardless of CWD.
_SRC_DIR = Path(__file__).resolve().parent
CHARTS_ABS_PATH = str(_SRC_DIR / "static" / "charts")

# Hardened instructions to prevent sandbox escapes and strictly enforce visualization rules.
# NOTE: CHARTS_ABS_PATH is injected at runtime so the agent always uses a correct absolute path.
def _build_chart_prompt() -> str:
    return f"""
You are a highly capable data analyst using Pandas and Matplotlib.

### OUTPUT FORMAT (MANDATORY)
Always end your response with EXACTLY this line (no extra words before or after):
  Final Answer: <your complete answer here>

Do NOT write "I now know the final answer" without the "Final Answer:" prefix.

### SECURITY & COMPLIANCE DIRECTIVES (CRITICAL)
1. You are running in a strictly sandboxed environment.
2. You are FORBIDDEN from importing or using the `os`, `sys`, or `subprocess` modules.
3. You are FORBIDDEN from issuing any system-level commands or reading unauthorized files.

### GRAPHING DIRECTIVES
1. ONLY use matplotlib.pyplot for plotting (`import matplotlib.pyplot as plt`).
2. NEVER call `plt.show()` — the environment is fully headless and this WILL crash.
3. ALWAYS save plots using the ABSOLUTE path below (never a relative path):
   - Chart directory: `{CHARTS_ABS_PATH}`
   - Example: `plt.savefig(r"{CHARTS_ABS_PATH}/my_plot.png")`
   - Generate a unique, descriptive filename (e.g. year_distribution.png).
4. ALWAYS call `plt.close('all')` immediately after saving.
5. In your Final Answer, state the full saved file path.
"""

def initialize_agent(
    df: pd.DataFrame,
    temperature: float = 0.0,
    model_name: str = "llama-3.3-70b-versatile",
) -> object:
    """
    Initializes the LangChain Pandas DataFrame Agent using Groq and enforces
    visualization rules. Key reliability fixes applied here:
      - handle_parsing_errors via agent_executor_kwargs (not top-level kwarg)
      - Absolute chart path injected into the prompt prefix
      - Matplotlib Agg backend forced at module load time
    """
    logger.info(f"Initializing ChatGroq model: {model_name} with temperature {temperature}")
    llm = ChatGroq(temperature=temperature, model_name=model_name)

    # Ensure the chart directory exists before the agent needs it
    os.makedirs(CHARTS_ABS_PATH, exist_ok=True)
    logger.info(f"Verified chart storage directory at: {CHARTS_ABS_PATH}")

    logger.info("Setting up Pandas DataFrame Agent with charting + error-handling...")

    agent = create_pandas_dataframe_agent(
        llm=llm,
        df=df,
        prefix=_build_chart_prompt(),             # Absolute chart path + format rules
        verbose=True,
        agent_type="zero-shot-react-description",
        allow_dangerous_code=True,
        return_intermediate_steps=True,
        max_iterations=12,                        # Cap runaway loops
        # handle_parsing_errors must go into agent_executor_kwargs so LangChain
        # actually wires it into the AgentExecutor — passing it at the top level
        # is silently ignored by create_pandas_dataframe_agent in most versions.
        agent_executor_kwargs={
            "handle_parsing_errors": True,
        },
    )

    logger.info("Agent initialization complete.")
    return agent
