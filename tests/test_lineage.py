"""Lineage and trace tests."""


def test_trace_activation(client, sample_accounts):
    """Trace should activate and propagate to downstream allocations."""
    # Victim -> A
    txn1 = client.post("/api/payments/send", json={
        "sender_account_id": sample_accounts["victim"],
        "receiver_account_id": sample_accounts["A"],
        "amount_rupees": 10000.0,
    }).json()

    # A -> B
    client.post("/api/payments/send", json={
        "sender_account_id": sample_accounts["A"],
        "receiver_account_id": sample_accounts["B"],
        "amount_rupees": 6000.0,
    })

    # A -> C
    client.post("/api/payments/send", json={
        "sender_account_id": sample_accounts["A"],
        "receiver_account_id": sample_accounts["C"],
        "amount_rupees": 4000.0,
    })

    # Report fraud AFTER money has moved
    fraud_resp = client.post("/api/fraud/report", json={
        "reporting_account_id": sample_accounts["victim"],
        "transaction_id": txn1["transaction_id"],
        "fraud_category": "PAYMENT_FRAUD",
    })
    assert fraud_resp.status_code == 200
    trace_id = fraud_resp.json()["trace_id"]
    assert trace_id is not None

    # Trace the money
    trace_resp = client.get(f"/api/fraud/trace/{trace_id}")
    assert trace_resp.status_code == 200
    trace_data = trace_resp.json()

    # Original amount should be 10000
    assert trace_data["original_amount_rupees"] == 10000.0

    # Total traceable should be <= 10000
    assert trace_data["total_traceable_remaining_rupees"] <= 10000.0

    # Multiple accounts should hold traced funds
    assert len(trace_data["accounts_holding_funds"]) >= 2


def test_no_double_counting(client, sample_accounts):
    """Traced money should never exceed the original reported amount."""
    txn = client.post("/api/payments/send", json={
        "sender_account_id": sample_accounts["victim"],
        "receiver_account_id": sample_accounts["A"],
        "amount_rupees": 5000.0,
    }).json()

    # A -> B -> D chain
    client.post("/api/payments/send", json={
        "sender_account_id": sample_accounts["A"],
        "receiver_account_id": sample_accounts["B"],
        "amount_rupees": 3000.0,
    })
    client.post("/api/payments/send", json={
        "sender_account_id": sample_accounts["B"],
        "receiver_account_id": sample_accounts["D"],
        "amount_rupees": 2000.0,
    })

    fraud_resp = client.post("/api/fraud/report", json={
        "reporting_account_id": sample_accounts["victim"],
        "transaction_id": txn["transaction_id"],
        "fraud_category": "PAYMENT_FRAUD",
    })
    trace_id = fraud_resp.json()["trace_id"]

    trace_data = client.get(f"/api/fraud/trace/{trace_id}").json()

    # Sum of all accounts' traceable balances must <= reported amount
    total_traced = sum(
        a["traceable_balance_rupees"] for a in trace_data["accounts_holding_funds"]
    )
    assert total_traced <= 5000.0 + 0.01  # small tolerance for rounding


def test_multi_hop_reconstruction(client, sample_accounts):
    """Graph should reconstruct multi-hop paths."""
    txn = client.post("/api/payments/send", json={
        "sender_account_id": sample_accounts["victim"],
        "receiver_account_id": sample_accounts["A"],
        "amount_rupees": 8000.0,
    }).json()

    # A has 5000 initial + 8000 from victim = 13000; send 10000 so 5000 of victim's funds move to B
    client.post("/api/payments/send", json={
        "sender_account_id": sample_accounts["A"],
        "receiver_account_id": sample_accounts["B"],
        "amount_rupees": 10000.0,
    })
    # B has 3000 initial + 10000 from A = 13000; send 10000 so victim's funds move to C
    client.post("/api/payments/send", json={
        "sender_account_id": sample_accounts["B"],
        "receiver_account_id": sample_accounts["C"],
        "amount_rupees": 10000.0,
    })

    fraud_resp = client.post("/api/fraud/report", json={
        "reporting_account_id": sample_accounts["victim"],
        "transaction_id": txn["transaction_id"],
        "fraud_category": "PAYMENT_FRAUD",
    })
    trace_id = fraud_resp.json()["trace_id"]

    trace_data = client.get(f"/api/fraud/trace/{trace_id}").json()
    assert trace_data["hop_count"] >= 2
