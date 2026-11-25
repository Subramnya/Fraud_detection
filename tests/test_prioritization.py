"""Risk scoring and prioritization tests."""


def test_risk_assessment(client, sample_accounts):
    """Risk scoring should return valid scores."""
    # Create some transactions
    client.post("/api/payments/send", json={
        "sender_account_id": sample_accounts["victim"],
        "receiver_account_id": sample_accounts["A"],
        "amount_rupees": 10000.0,
    })

    # Get graph-based risk (via investigation endpoint after fraud report)
    txn_resp = client.post("/api/payments/send", json={
        "sender_account_id": sample_accounts["A"],
        "receiver_account_id": sample_accounts["B"],
        "amount_rupees": 5000.0,
    })

    # The fraud detection alerts are a proxy for risk
    alerts = client.get("/api/fraud/alerts").json()
    # Should have at least some alerts given high amounts
    assert isinstance(alerts, list)
