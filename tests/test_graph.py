"""Graph analysis tests."""


def test_graph_reconstruction(client, sample_accounts):
    """Graph should correctly represent transactions."""
    client.post("/api/payments/send", json={
        "sender_account_id": sample_accounts["victim"],
        "receiver_account_id": sample_accounts["A"],
        "amount_rupees": 5000.0,
    })
    client.post("/api/payments/send", json={
        "sender_account_id": sample_accounts["A"],
        "receiver_account_id": sample_accounts["B"],
        "amount_rupees": 3000.0,
    })

    graph_data = client.get(f"/api/graph/account/{sample_accounts['A']}").json()
    assert len(graph_data["nodes"]) >= 3
    assert len(graph_data["edges"]) >= 2
