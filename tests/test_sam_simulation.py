"""Tests for Sam (ShadowPay) normal customer integration, detection evidence, and banker backend."""


def test_sam_normal_customer_and_payments(client, sample_accounts):
    # Register/retrieve Sam
    r1 = client.get("/api/simulation/sam")
    assert r1.status_code == 200
    sam1 = r1.json()
    assert sam1["username"] == "Sam"
    assert sam1["display_name"] == "ShadowPay"
    assert sam1["account_type"] == "NORMAL"
    assert sam1["account_id"].startswith("ACC_")

    # Idempotent: second call returns same account
    r2 = client.get("/api/simulation/sam")
    assert r2.status_code == 200
    assert r2.json()["account_id"] == sam1["account_id"]

    sam_id = sam1["account_id"]
    initial_sam_bal = sam1["balance_rupees"]

    # Normal payment TO Sam should NOT trigger fraud alerts
    pay_in = client.post("/api/payments/send", json={
        "sender_account_id": sample_accounts["victim"],
        "receiver_account_id": sam_id,
        "amount_rupees": 500.0,
        "description": "Normal payment to Sam",
    })
    assert pay_in.status_code == 200

    # Normal payment FROM Sam should NOT trigger fraud alerts
    pay_out = client.post("/api/payments/send", json={
        "sender_account_id": sam_id,
        "receiver_account_id": sample_accounts["A"],
        "amount_rupees": 200.0,
        "description": "Normal payment from Sam",
    })
    assert pay_out.status_code == 200

    # No alerts generated for normal ₹500/₹200 payments
    sam_alerts = client.get(f"/api/fraud/alerts?account_id={sam_id}").json()
    assert len(sam_alerts) == 0

    # Verify balance consistency & allocations
    bal = client.get(f"/api/accounts/{sam_id}/balance").json()
    assert bal["balance_rupees"] == initial_sam_bal + 300.0
    allocs = client.get(f"/api/accounts/{sam_id}/allocations").json()
    assert allocs["total_balance_rupees"] == bal["balance_rupees"]


def test_detection_rules_evidence_and_banker_profile(client, sample_accounts):
    sam = client.get("/api/simulation/sam").json()
    sam_id = sam["account_id"]

    # 1. FAN_IN
    fan_in = client.post("/api/simulation/sam/scenario", json={"scenario": "FAN_IN"}).json()
    assert len(fan_in["transactions"]) == 5
    fanin_alerts = [a for a in fan_in["alerts_detected"] if a["rule_triggered"] == "FAN_IN"]
    assert len(fanin_alerts) >= 1

    # 2. FAN_OUT
    fan_out = client.post("/api/simulation/sam/scenario", json={"scenario": "FAN_OUT"}).json()
    assert any(a["rule_triggered"] == "FAN_OUT" for a in fan_out["alerts_detected"])

    # 3. HIGH_VELOCITY
    vel = client.post("/api/simulation/sam/scenario", json={"scenario": "HIGH_VELOCITY"}).json()
    assert any(a["rule_triggered"] == "HIGH_VELOCITY" for a in vel["alerts_detected"])

    # 4. TRANSACTION_SPLITTING (now detected by _check_transaction_splitting!)
    split = client.post("/api/simulation/sam/scenario", json={"scenario": "TRANSACTION_SPLITTING"}).json()
    assert any(a["rule_triggered"] == "TRANSACTION_SPLITTING" for a in split["alerts_detected"])

    # 5. RAPID_PASSTHROUGH
    pt = client.post("/api/simulation/sam/scenario", json={"scenario": "RAPID_PASSTHROUGH"}).json()
    assert any(a["rule_triggered"] == "RAPID_PASSTHROUGH" for a in pt["alerts_detected"])

    # Verify stored alert evidence & banker investigation profile endpoint
    profile = client.get(f"/api/investigation/account/{sam_id}/profile")
    assert profile.status_code == 200
    prof_data = profile.json()
    assert prof_data["account"]["account_id"] == sam_id
    assert prof_data["risk_profile"]["overall_score"] >= 0
    assert len(prof_data["alerts"]) >= 4

    for alert in prof_data["alerts"]:
        ev = alert["evidence"]
        assert ev is not None
        assert len(ev["supporting_transaction_ids"]) >= 1
        assert len(ev["amounts_rupees"]) >= 1
        assert "explanation" in ev

    # Verify graph edges & final destinations
    assert len(prof_data["graph"]["nodes"]) >= 2
    assert len(prof_data["graph"]["edges"]) >= 5
    first_edge = prof_data["graph"]["edges"][0]
    assert "transaction_id" in first_edge
    assert "amount_rupees" in first_edge
    assert "timestamp" in first_edge
    assert "final_destination_accounts" in prof_data["graph"]
