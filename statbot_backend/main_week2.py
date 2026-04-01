# statbot_backend/main_week2.py
import os
import sys

# Ensure src is discoverable if ran from root
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from src.config import load_environment, logger
from src.data_ingestion import load_csv_to_dataframe
from src.agent import initialize_agent

def run_graphing_test():
    # 1. Load configuration and API Keys
    env_vars = load_environment()
    
    if not env_vars.get("GROQ_API_KEY") or env_vars.get("GROQ_API_KEY") == "your_groq_api_key_here":
        logger.error("A valid GROQ_API_KEY must be provided to run the tests. Exiting.")
        return
        
    # 2. Ingest the Data
    csv_path = os.path.join(os.path.dirname(__file__), "data", "sample_data.csv")
    df = load_csv_to_dataframe(csv_path)
    
    if df is None:
        logger.error("Data loading failed. Exiting tests.")
        return

    # 3. Initialize the Weekly Graphing Agent
    agent = initialize_agent(df=df)

    # 4. Execute the Week 2 Test Query string
    query = "Plot sales over time, showing a 3-month rolling average."
    
    logger.info("="*50)
    logger.info(f"Executing Graphing Query: '{query}'")
    logger.info("="*50)
    
    try:
        # We use invoke to extract the steps and ensure plotting doesn't break
        response = agent.invoke({"input": query})
        
        print("\n--- FINAL ANSWER ---")
        print(response.get("output"))
        
        print("\n--- INTERMEDIATE STEPS (THOUGHT PROCESS) ---")
        for step in response.get("intermediate_steps", []):
            action, result = step
            print(f"Tool Used: {action.tool}")
            
            # The tool_input is the python code the LLM generated and ran
            code = action.tool_input.get('query') if isinstance(action.tool_input, dict) else action.tool_input
            print(f"Generated Code:\n{code}")
            print(f"Execution Result: {result}\n")
            
    except Exception as e:
        logger.error(f"Error executing agent graphing workflow: {e}")

if __name__ == "__main__":
    logger.info("Starting StatBot Pro Week 2 Graphing Executions...")
    run_graphing_test()
    logger.info("Executions completed.")
