"""Fraud detection rule tests."""


def test_high_amount_alert(client, sample_accounts):
    """High amount transaction should trigger an alert."""
    client.post("/api/payments/send", json={
        "sender_account_id": sample_accounts["victim"],
        "receiver_account_id": sample_accounts["A"],
        "amount_rupees": 10000.0,
    })

    alerts = client.get(f"/api/fraud/alerts?account_id={sample_accounts['victim']}").json()
    high_amount_alerts = [a for a in alerts if a["rule_triggered"] == "HIGH_AMOUNT"]
    assert len(high_amount_alerts) >= 1


def test_health_check(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "healthy"
