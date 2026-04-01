# statbot_backend/main.py
import os
import sys

# Ensure src is discoverable if ran from root
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from src.config import load_environment, logger
from src.data_ingestion import load_csv_to_dataframe
from src.agent import initialize_agent

def run_tests():
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

    # 3. Initialize the Agent
    agent = initialize_agent(df=df)

    # 4. Execute Queries and Display Thought Process
    queries = [
        "How many rows are there in the dataframe?",
        "What is the mean value of the 'Revenue' column?"
    ]
    
    for idx, query in enumerate(queries, 1):
        print("\n" + "="*50)
        print(f"Executing Test Query {idx}: {query}")
        print("="*50)
        
        try:
            # We use invoke to get the parsed response including intermediate logic
            response = agent.invoke({"input": query})
            
            print("\n--- FINAL ANSWER ---")
            print(response.get("output"))
            
            print("\n--- INTERMEDIATE STEPS (THOUGHT PROCESS) ---")
            for step in response.get("intermediate_steps", []):
                # Langchain returns intermediate_steps as a tuple of (AgentAction/ToolAction, Result)
                action, result = step
                print(f"Tool Used: {action.tool}")
                print(f"Generated Pandas Code:\n{action.tool_input.get('query') if isinstance(action.tool_input, dict) else action.tool_input}")
                print(f"Execution Result:\n{result}\n")
                
        except Exception as e:
            logger.error(f"Error querying the agent: {e}")

if __name__ == "__main__":
    logger.info("Starting StatBot Pro Week 1 Executions...")
    run_tests()
    logger.info("Executions completed.")
