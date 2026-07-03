"""Run one or more .sql files against a Databricks SQL warehouse using the Statement
Execution API, splitting each file into individual statements on ';' at line end.

Usage:
    python3 run_sql.py --profile Azure-ytcy-east2 --warehouse-id 9c8fac7a0b250221 file1.sql [file2.sql ...]
"""
import argparse
import sys
import time

from databricks.sdk import WorkspaceClient
from databricks.sdk.service.sql import StatementState


def split_statements(sql_text: str) -> list[str]:
    lines = [line for line in sql_text.splitlines() if not line.strip().startswith("--")]
    cleaned = "\n".join(lines)
    statements = [chunk.strip() for chunk in cleaned.split(";")]
    return [s for s in statements if s.strip(" \n\t;")]


def run_statement(w: WorkspaceClient, warehouse_id: str, statement: str) -> None:
    preview = " ".join(statement.split())[:100]
    print(f"--> {preview}...")
    resp = w.statement_execution.execute_statement(
        statement=statement,
        warehouse_id=warehouse_id,
        wait_timeout="30s",
    )
    statement_id = resp.statement_id
    while resp.status.state in (StatementState.PENDING, StatementState.RUNNING):
        time.sleep(2)
        resp = w.statement_execution.get_statement(statement_id)
    if resp.status.state != StatementState.SUCCEEDED:
        error = resp.status.error
        raise RuntimeError(f"Statement failed: {error}\nStatement: {statement}")
    print("    OK")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", required=True)
    parser.add_argument("--warehouse-id", required=True)
    parser.add_argument("files", nargs="+")
    args = parser.parse_args()

    w = WorkspaceClient(profile=args.profile)

    for path in args.files:
        print(f"=== {path} ===")
        with open(path) as f:
            sql_text = f.read()
        for statement in split_statements(sql_text):
            run_statement(w, args.warehouse_id, statement)

    print("All statements completed successfully.")


if __name__ == "__main__":
    sys.exit(main())
