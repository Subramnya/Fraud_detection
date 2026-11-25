"""Freeze request tests."""


def test_freeze_workflow(client, sample_accounts):
    """Test complete freeze request workflow."""
    # Setup: payment -> fraud report -> freeze request -> review
    txn = client.post("/api/payments/send", json={
        "sender_account_id": sample_accounts["victim"],
        "receiver_account_id": sample_accounts["A"],
        "amount_rupees": 10000.0,
    }).json()

    client.post("/api/payments/send", json={
        "sender_account_id": sample_accounts["A"],
        "receiver_account_id": sample_accounts["B"],
        "amount_rupees": 5000.0,
    })

    fraud_resp = client.post("/api/fraud/report", json={
        "reporting_account_id": sample_accounts["victim"],
        "transaction_id": txn["transaction_id"],
        "fraud_category": "PAYMENT_FRAUD",
    }).json()

    # Create freeze request
    freeze_resp = client.post("/api/freeze/request", json={
        "case_id": fraud_resp["case_id"],
        "account_id": sample_accounts["B"],
        "reason": "Traced fraud funds",
    })
    assert freeze_resp.status_code == 200
    freeze_data = freeze_resp.json()
    assert freeze_data["status"] in ["PENDING_REVIEW", "INSUFFICIENT_BALANCE"]

    if freeze_data["status"] == "PENDING_REVIEW":
        # Approve it
        review_resp = client.post(
            f"/api/freeze/requests/{freeze_data['request_id']}/review",
            json={
                "status": "APPROVED_SIMULATED",
                "reviewer": "test_admin",
                "review_notes": "Approved for testing"
            }
        )
        assert review_resp.status_code == 200
        assert review_resp.json()["status"] == "APPROVED_SIMULATED"

    # Test rejection
    freeze_resp2 = client.post("/api/freeze/request", json={
        "case_id": fraud_resp["case_id"],
        "account_id": sample_accounts["A"],
        "reason": "Also check A",
    })
    if freeze_resp2.status_code == 200 and freeze_resp2.json()["status"] == "PENDING_REVIEW":
        reject_resp = client.post(
            f"/api/freeze/requests/{freeze_resp2.json()['request_id']}/review",
            json={
                "status": "REJECTED",
                "reviewer": "test_admin",
                "review_notes": "Insufficient evidence"
            }
        )
        assert reject_resp.status_code == 200
        assert reject_resp.json()["status"] == "REJECTED"
