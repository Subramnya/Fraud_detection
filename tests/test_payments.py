"""Payment processing tests."""


def test_successful_payment(client, sample_accounts):
    resp = client.post("/api/payments/send", json={
        "sender_account_id": sample_accounts["victim"],
        "receiver_account_id": sample_accounts["A"],
        "amount_rupees": 1000.0,
        "description": "Test payment"
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "COMPLETED"
    assert data["amount_rupees"] == 1000.0

    # Check balances
    sender_bal = client.get(f"/api/accounts/{sample_accounts['victim']}/balance").json()
    receiver_bal = client.get(f"/api/accounts/{sample_accounts['A']}/balance").json()
    assert sender_bal["balance_rupees"] == 49000.0
    assert receiver_bal["balance_rupees"] == 6000.0


def test_insufficient_balance(client, sample_accounts):
    resp = client.post("/api/payments/send", json={
        "sender_account_id": sample_accounts["A"],
        "receiver_account_id": sample_accounts["B"],
        "amount_rupees": 999999.0,
    })
    assert resp.status_code == 400
    assert "Insufficient" in resp.json()["detail"]


def test_self_transfer_rejected(client, sample_accounts):
    resp = client.post("/api/payments/send", json={
        "sender_account_id": sample_accounts["A"],
        "receiver_account_id": sample_accounts["A"],
        "amount_rupees": 100.0,
    })
    assert resp.status_code == 400


def test_negative_amount_rejected(client):
    # First create accounts
    r1 = client.post("/api/accounts/register", json={
        "name": "Neg1", "email": "neg1@test.com", "initial_balance_rupees": 1000.0
    })
    r2 = client.post("/api/accounts/register", json={
        "name": "Neg2", "email": "neg2@test.com", "initial_balance_rupees": 0.0
    })
    resp = client.post("/api/payments/send", json={
        "sender_account_id": r1.json()["account_id"],
        "receiver_account_id": r2.json()["account_id"],
        "amount_rupees": -100.0,
    })
    assert resp.status_code == 422  # Pydantic validation


def test_invalid_account_rejected(client, sample_accounts):
    resp = client.post("/api/payments/send", json={
        "sender_account_id": "ACC_NONEXIST",
        "receiver_account_id": sample_accounts["A"],
        "amount_rupees": 100.0,
    })
    assert resp.status_code == 400


def test_debit_equals_credit(client, sample_accounts):
    """Verify total debit == total credit == transaction amount."""
    sender_before = client.get(f"/api/accounts/{sample_accounts['victim']}/balance").json()["balance_paise"]
    receiver_before = client.get(f"/api/accounts/{sample_accounts['A']}/balance").json()["balance_paise"]

    amount = 2500.0
    resp = client.post("/api/payments/send", json={
        "sender_account_id": sample_accounts["victim"],
        "receiver_account_id": sample_accounts["A"],
        "amount_rupees": amount,
    })
    assert resp.status_code == 200

    sender_after = client.get(f"/api/accounts/{sample_accounts['victim']}/balance").json()["balance_paise"]
    receiver_after = client.get(f"/api/accounts/{sample_accounts['A']}/balance").json()["balance_paise"]

    debit = sender_before - sender_after
    credit = receiver_after - receiver_before
    assert debit == credit == int(amount * 100)


def test_get_transaction(client, sample_accounts):
    resp = client.post("/api/payments/send", json={
        "sender_account_id": sample_accounts["victim"],
        "receiver_account_id": sample_accounts["A"],
        "amount_rupees": 500.0,
    })
    txn_id = resp.json()["transaction_id"]

    resp = client.get(f"/api/payments/{txn_id}")
    assert resp.status_code == 200
    assert resp.json()["transaction_id"] == txn_id
