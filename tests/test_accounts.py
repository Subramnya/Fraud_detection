"""Account registration and management tests."""


def test_register_account(client):
    resp = client.post("/api/accounts/register", json={
        "name": "John Doe", "email": "john@test.com",
        "initial_balance_rupees": 10000.0,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["account_id"].startswith("ACC_")
    assert data["balance_rupees"] == 10000.0
    assert data["is_active"] is True


def test_duplicate_email_rejected(client):
    client.post("/api/accounts/register", json={
        "name": "Jane", "email": "jane@test.com", "initial_balance_rupees": 100.0
    })
    resp = client.post("/api/accounts/register", json={
        "name": "Jane2", "email": "jane@test.com", "initial_balance_rupees": 100.0
    })
    assert resp.status_code == 400


def test_get_account(client):
    resp = client.post("/api/accounts/register", json={
        "name": "Get Test", "email": "get@test.com", "initial_balance_rupees": 5000.0
    })
    acc_id = resp.json()["account_id"]

    resp = client.get(f"/api/accounts/{acc_id}")
    assert resp.status_code == 200
    assert resp.json()["account_id"] == acc_id


def test_account_not_found(client):
    resp = client.get("/api/accounts/ACC_NONEXIST")
    assert resp.status_code == 404


def test_get_balance(client):
    resp = client.post("/api/accounts/register", json={
        "name": "Balance Test", "email": "bal@test.com",
        "initial_balance_rupees": 7500.0
    })
    acc_id = resp.json()["account_id"]

    resp = client.get(f"/api/accounts/{acc_id}/balance")
    assert resp.status_code == 200
    assert resp.json()["balance_rupees"] == 7500.0
    assert resp.json()["balance_paise"] == 750000


def test_get_allocations(client):
    resp = client.post("/api/accounts/register", json={
        "name": "Alloc Test", "email": "alloc@test.com",
        "initial_balance_rupees": 10000.0
    })
    acc_id = resp.json()["account_id"]

    resp = client.get(f"/api/accounts/{acc_id}/allocations")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_balance_rupees"] == 10000.0
    assert len(data["allocations"]) == 1
    assert data["legitimate_total_rupees"] == 10000.0
    assert data["traceable_total_rupees"] == 0.0


def test_list_accounts(client):
    client.post("/api/accounts/register", json={
        "name": "List1", "email": "list1@test.com", "initial_balance_rupees": 100.0
    })
    client.post("/api/accounts/register", json={
        "name": "List2", "email": "list2@test.com", "initial_balance_rupees": 200.0
    })
    resp = client.get("/api/accounts")
    assert resp.status_code == 200
    assert len(resp.json()) >= 2
