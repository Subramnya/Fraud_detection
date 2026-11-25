"""Test configuration and fixtures."""
import pytest
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient
from fraudtrace.app.core.database import Base, get_db
from fraudtrace.app.main import app


# Use in-memory SQLite for tests
TEST_DB_URL = "sqlite:///./data/test_fraudtrace.db"
test_engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})


@event.listens_for(test_engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


def override_get_db():
    db = TestSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="function")
def db_session():
    """Create a fresh database for each test."""
    os.makedirs("data", exist_ok=True)
    Base.metadata.create_all(bind=test_engine)
    db = TestSessionLocal()
    yield db
    db.close()
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture(scope="function")
def client(db_session):
    """Create a test client with overridden database."""
    app.dependency_overrides[get_db] = override_get_db
    Base.metadata.create_all(bind=test_engine)
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def sample_accounts(client):
    """Create sample accounts for testing."""
    accounts = {}

    resp = client.post("/api/accounts/register", json={
        "name": "Test Victim", "email": "victim@test.com",
        "initial_balance_rupees": 50000.0
    })
    assert resp.status_code == 200
    accounts["victim"] = resp.json()["account_id"]

    resp = client.post("/api/accounts/register", json={
        "name": "Test Account A", "email": "a@test.com",
        "initial_balance_rupees": 5000.0
    })
    assert resp.status_code == 200
    accounts["A"] = resp.json()["account_id"]

    resp = client.post("/api/accounts/register", json={
        "name": "Test Account B", "email": "b@test.com",
        "initial_balance_rupees": 3000.0
    })
    assert resp.status_code == 200
    accounts["B"] = resp.json()["account_id"]

    resp = client.post("/api/accounts/register", json={
        "name": "Test Account C", "email": "c@test.com",
        "initial_balance_rupees": 2000.0
    })
    assert resp.status_code == 200
    accounts["C"] = resp.json()["account_id"]

    resp = client.post("/api/accounts/register", json={
        "name": "Test Account D", "email": "d@test.com",
        "initial_balance_rupees": 1000.0
    })
    assert resp.status_code == 200
    accounts["D"] = resp.json()["account_id"]

    return accounts
