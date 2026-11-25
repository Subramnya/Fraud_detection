"""Allocation and money conservation tests."""


def test_allocation_conservation(client, sample_accounts):
    """After a transfer, sum of all allocations must remain constant."""
    # Get initial allocation totals
    victim_allocs = client.get(f"/api/accounts/{sample_accounts['victim']}/allocations").json()
    a_allocs = client.get(f"/api/accounts/{sample_accounts['A']}/allocations").json()

    initial_total = (
        sum(a["amount_paise"] for a in victim_allocs["allocations"]) +
        sum(a["amount_paise"] for a in a_allocs["allocations"])
    )

    # Transfer
    client.post("/api/payments/send", json={
        "sender_account_id": sample_accounts["victim"],
        "receiver_account_id": sample_accounts["A"],
        "amount_rupees": 5000.0,
    })

    # Check allocations after
    victim_allocs2 = client.get(f"/api/accounts/{sample_accounts['victim']}/allocations").json()
    a_allocs2 = client.get(f"/api/accounts/{sample_accounts['A']}/allocations").json()

    final_total = (
        sum(a["amount_paise"] for a in victim_allocs2["allocations"]) +
        sum(a["amount_paise"] for a in a_allocs2["allocations"])
    )

    assert initial_total == final_total


def test_multiple_sources_in_account(client, sample_accounts):
    """An account should contain allocations from multiple sources."""
    # Send from victim to A
    client.post("/api/payments/send", json={
        "sender_account_id": sample_accounts["victim"],
        "receiver_account_id": sample_accounts["A"],
        "amount_rupees": 2000.0,
    })

    # Send from B to A
    client.post("/api/payments/send", json={
        "sender_account_id": sample_accounts["B"],
        "receiver_account_id": sample_accounts["A"],
        "amount_rupees": 1000.0,
    })

    # A should have its initial allocation + 2 new ones
    allocs = client.get(f"/api/accounts/{sample_accounts['A']}/allocations").json()
    assert len(allocs["allocations"]) >= 3  # initial + victim + B
    assert allocs["total_balance_rupees"] == 8000.0  # 5000 + 2000 + 1000


def test_fraud_first_allocation(client, sample_accounts):
    """Under FRAUD_FIRST policy, traced money should be allocated first."""
    # Create a fraud scenario: victim -> A, then report fraud
    txn = client.post("/api/payments/send", json={
        "sender_account_id": sample_accounts["victim"],
        "receiver_account_id": sample_accounts["A"],
        "amount_rupees": 5000.0,
    }).json()

    # Report fraud on this transaction
    fraud_resp = client.post("/api/fraud/report", json={
        "reporting_account_id": sample_accounts["victim"],
        "transaction_id": txn["transaction_id"],
        "fraud_category": "PAYMENT_FRAUD",
    })
    assert fraud_resp.status_code == 200

    # Check A's allocations - should have traced money
    allocs = client.get(f"/api/accounts/{sample_accounts['A']}/allocations").json()
    assert allocs["traceable_total_rupees"] > 0

    # Now A sends 5000 to B - fraud-first should use traced money first
    client.post("/api/payments/send", json={
        "sender_account_id": sample_accounts["A"],
        "receiver_account_id": sample_accounts["B"],
        "amount_rupees": 5000.0,
    })

    # Check B's allocations - should contain traced money
    b_allocs = client.get(f"/api/accounts/{sample_accounts['B']}/allocations").json()
    assert b_allocs["traceable_total_rupees"] > 0
