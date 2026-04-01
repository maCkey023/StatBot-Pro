# statbot_backend/src/data_ingestion.py
import pandas as pd
import logging
from typing import Optional

logger = logging.getLogger(__name__)

def load_csv_to_dataframe(file_path: str) -> Optional[pd.DataFrame]:
    """
    Reads a CSV file into a Pandas DataFrame.
    
    Args:
        file_path (str): The relative or absolute path to the CSV file.
        
    Returns:
        pd.DataFrame or None: The loaded DataFrame, or None if an error occurs.
    """
    try:
        logger.info(f"Attempting to load CSV file from: {file_path}")
        df = pd.read_csv(file_path)
        
        # Basic Validation / Information
        logger.info(f"Successfully loaded CSV. Dimensions: {df.shape[0]} rows, {df.shape[1]} columns.")
        return df
        
    except FileNotFoundError:
        logger.error(f"Error: The file '{file_path}' was not found.")
        return None
    except pd.errors.EmptyDataError:
        logger.error(f"Error: The file '{file_path}' is empty.")
        return None
    except Exception as e:
        logger.error(f"An unexpected error occurred while loading the CSV: {e}")
        return None
