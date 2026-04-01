# statbot_backend/Dockerfile
FROM python:3.11-slim

# Set environment variables to prevent Python from writing pyc files and buffering stdout
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Create a non-root user for security (Least Privilege Principle)
RUN useradd -m -s /bin/bash statbot_user

WORKDIR /app

# Install dependencies (do this before copying source to leverage Docker cache)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Create designated directories for rigorous permission control
RUN mkdir -p /app/data /app/src/static/charts 

# Copy the rest of the application
COPY src/ /app/src/
COPY tests/ /app/tests/
COPY main*.py /app/

# Transfer ownership of the necessary directories to the non-root user
RUN chown -R statbot_user:statbot_user /app

# Switch to the non-root user
USER statbot_user

# Default command
CMD ["python", "tests/security_audit.py"]
