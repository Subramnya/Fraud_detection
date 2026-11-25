# FraudTrace

**Graph-Based Real-Time Fraud Detection and Transaction Lineage Analysis Platform**

> ⚠️ **SYNTHETIC PROTOTYPE WARNING**: This is a synthetic prototype for demonstration and research purposes only. It is not connected to real payment systems (UPI, bank accounts, or payment gateways) and does not make production security or regulatory compliance claims.

---

## Overview

FraudTrace monitors simulated virtual instant payments, tracks source-aware fund allocations from origin through multi-hop transfers, detects suspicious patterns in real time, activates Trace IDs on delayed fraud reports, reconstructs transaction graphs with NetworkX, scores account risk, prioritizes investigations and freeze recommendations, and generates structured investigation reports.

### Key Features

1. **Virtual Payment Ecosystem & Financial Ledger**
   - Integer paise arithmetic (no floating-point errors) in INR.
   - Atomic SQLite database transactions for debit, credit, ledger entries, and fund allocations.
2. **Source-Aware Money Allocation Engine**
   - Tracks every incoming fund lot independently with `origin_transaction_id`, `parent_allocation_id`, and `trace_id`.
   - Supports configurable allocation policies (`FRAUD_FIRST`, `FIFO`, `PROPORTIONAL`).
   - Preserves money conservation invariants (`Total Debit == Total Credit == Amount`).
3. **Trace ID & Money Lineage Engine**
   - Supports delayed fraud reporting (tracing money that moved *before* the fraud report was submitted).
   - Multi-hop downstream lineage reconstruction without double-counting.
4. **Real-Time Rule-Based Fraud Detection**
   - Detects High Amount, High Velocity, Fan-Out, Fan-In, and Rapid Pass-Through patterns.
5. **Graph Analysis Engine (NetworkX)**
   - Reconstructs directed transaction graphs from SQLite records for Case IDs, Trace IDs, and Account IDs.
6. **Explainable Risk Scoring & Prioritization**
   - Separate **Investigation Priority** ($P = 0.25A + 0.30R + 0.20M + 0.25U$) and **Freeze Priority** ($\min(\text{traceable}, \text{available})$).
7. **Simulated Freeze Management & Investigation Reports**
   - Controlled review workflow (`PENDING_REVIEW`, `APPROVED_SIMULATED`, `PARTIALLY_APPROVED_SIMULATED`, `REJECTED`, `INSUFFICIENT_BALANCE`) with full audit logging.

---

## Project Structure

```
Fraud_detection/
├── fraudtrace/
│   └── app/
│       ├── main.py                 # FastAPI application entry point
│       ├── core/                   # Config and SQLite database setup
│       ├── models/                 # SQLAlchemy ORM models
│       ├── schemas/                # Pydantic request/response schemas
│       ├── api/                    # REST API routers
│       ├── services/               # Core business logic engines
│       ├── simulation/             # Seed data & fraud scenarios
│       └── utils/                  # ID generators and currency helpers
├── scripts/
│   ├── seed_database.py            # Reproducible synthetic data seeder
│   └── run_demo.py                 # End-to-end demo runner
├── tests/                          # Pytest automated test suite
├── data/                           # SQLite database & generated reports
├── requirements.txt
├── pytest.ini
└── .env.example
```

---

## Installation & Running

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```
*(Note: On Python 3.14+, install unpinned latest compatible versions: `pip install fastapi uvicorn sqlalchemy pydantic pydantic-settings networkx pandas scikit-learn python-dotenv pytest httpx`)*

### 2. Run the Automated Test Suite
```bash
python -m pytest -v
```

### 3. Run the End-to-End Demo
```bash
python scripts/run_demo.py
```

### 4. Start the FastAPI Server
```bash
python -m uvicorn fraudtrace.app.main:app --host 127.0.0.1 --port 8000
```

- **Swagger UI (Interactive API Docs)**: http://127.0.0.1:8000/docs
- **Health Check**: http://127.0.0.1:8000/health
- **System Summary**: http://127.0.0.1:8000/api/system/summary

---

## API Endpoints

| Group | Method | Endpoint | Description |
|---|---|---|---|
| **System** | `GET` | `/health` | Health check |
| | `GET` | `/api/system/summary` | System statistics |
| **Accounts** | `POST` | `/api/accounts/register` | Register virtual account |
| | `GET` | `/api/accounts` | List all accounts |
| | `GET` | `/api/accounts/{account_id}` | Get account details |
| | `GET` | `/api/accounts/{account_id}/balance` | Get account balance |
| | `GET` | `/api/accounts/{account_id}/allocations` | Get source-aware fund allocations |
| **Payments** | `POST` | `/api/payments/send` | Send virtual payment |
| | `GET` | `/api/payments/{transaction_id}` | Get transaction details |
| | `GET` | `/api/payments/history/` | Get transaction history |
| **Fraud** | `POST` | `/api/fraud/report` | Report fraud & activate trace |
| | `GET` | `/api/fraud/cases` | List fraud cases |
| | `GET` | `/api/fraud/cases/{case_id}` | Get fraud case details |
| | `GET` | `/api/fraud/alerts` | List real-time fraud alerts |
| | `GET` | `/api/fraud/trace/{trace_id}` | Get money lineage trace summary |
| **Graph** | `GET` | `/api/graph/case/{case_id}` | Get NetworkX graph JSON for case |
| | `GET` | `/api/graph/trace/{trace_id}` | Get NetworkX graph JSON for trace |
| | `GET` | `/api/graph/account/{account_id}` | Get NetworkX graph JSON for account |
| **Investigation** | `GET` | `/api/investigation/{case_id}` | Full investigation view |
| | `GET` | `/api/investigation/{case_id}/priority` | Investigation priority ranking |
| | `GET` | `/api/investigation/{case_id}/timeline` | Transaction timeline |
| **Freeze** | `POST` | `/api/freeze/request` | Create simulated freeze request |
| | `GET` | `/api/freeze/requests` | List freeze requests |
| | `GET` | `/api/freeze/requests/{request_id}` | Get freeze request details |
| | `POST` | `/api/freeze/requests/{request_id}/review` | Approve/reject freeze request |
| **Reports** | `GET` | `/api/reports/{case_id}` | Generate JSON investigation report |

---

## Known Limitations & Future Integration Points

- **Authentication**: Intentionally deferred; user identity and authorization are decoupled from the payment engine for future OAuth2/JWT integration.
- **Database**: Uses SQLite for prototype portability; can be switched to PostgreSQL via `DATABASE_URL` in `.env`.
- **ML Anomaly Detection**: Rule-based scoring is active; Scikit-learn Isolation Forest can be plugged into `risk_service.py` without changing core payment or lineage logic.
- **Frontend & Export**: Graph endpoints return structured JSON ready for PyVis, Cytoscape, or React; `report_service.py` is structured for future PDF export.
