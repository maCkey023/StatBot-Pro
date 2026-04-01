# statbot_backend/src/config.py
import os
import logging
from pathlib import Path
from dotenv import load_dotenv

# Configure basic logging for the backend
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def load_environment():
    """
    Loads environment variables from the .env file using rigorous absolute pathing.
    Validates that required API keys are present.
    """
    # 1. Dynamically locate the current script (config.py)
    current_file_path = Path(__file__).resolve()
    
    # 2. Ascend to statbot_backend root 
    # current_file_path is statbot_backend/src/config.py
    # .parent is statbot_backend/src
    # .parent.parent is statbot_backend
    backend_root_dir = current_file_path.parent.parent
    
    # 3. Target the .env file explicitly
    env_file_path = backend_root_dir / ".env"
    
    # 4. Debug Logging
    print(f"\n[CONFIG DEBUG] Calculated absolute path to config.py: {current_file_path}")
    print(f"[CONFIG DEBUG] Calculated absolute path to .env: {env_file_path}")
    print(f"[CONFIG DEBUG] Does the .env file actually exist on disk? {env_file_path.exists()}\n")
    
    if not env_file_path.exists():
        logger.error(f"Critical: The .env file was NOT found at {env_file_path}")
    
    # 5. Load .env explicitly by absolute path
    load_dotenv(dotenv_path=env_file_path)
    
    groq_api_key = os.getenv("GROQ_API_KEY")
    
    if not groq_api_key or groq_api_key == "your_groq_api_key_here":
        logger.warning(
            "GROQ_API_KEY is not securely set in the environment. "
            "Please ensure you have created a .env file and provided a valid key."
        )
    else:
        logger.info("Environment variables successfully loaded.")
        
    return {
        "GROQ_API_KEY": groq_api_key
    }
