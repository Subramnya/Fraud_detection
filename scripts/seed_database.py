"""Script to seed the database with demo data."""
import sys
import os

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fraudtrace.app.simulation.seed_data import seed_database

if __name__ == "__main__":
    seed_database()
