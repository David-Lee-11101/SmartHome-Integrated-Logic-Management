import sqlite3
from pathlib import Path
from typing import Optional, Union


class SqliteInterface:
    COLUMNS = (
        "trigger_device", "trigger_condition", "query_device", "query_content",
        "action_device", "action_action", "is_pro", "priority",
    )

    def __init__(self, database: Optional[Union[str, Path]] = None) -> None:
        database_path = Path(database) if database else Path("data/rules.db")
        database_path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(str(database_path))
        columns = self.conn.execute("PRAGMA table_info(rule_table)").fetchall()
        existing_columns = tuple(column[1] for column in columns)
        if not existing_columns:
            self._create_schema()
        elif existing_columns != self.COLUMNS:
            self.conn.close()
            raise RuntimeError(
                "rule_table schema requires an explicit migration; existing data was preserved. "
                "Back up and migrate the table before reopening it."
            )

    def _create_schema(self) -> None:
        self.conn.execute(
            """CREATE TABLE rule_table(
                trigger_device TEXT NOT NULL,
                trigger_condition TEXT NOT NULL,
                query_device TEXT NOT NULL,
                query_content TEXT NOT NULL,
                action_device TEXT NOT NULL,
                action_action TEXT NOT NULL,
                is_pro INTEGER NOT NULL,
                priority INTEGER NOT NULL
            )"""
        )
        self.conn.commit()

    def query_all(self):
        return self.conn.execute("SELECT * FROM rule_table ORDER BY rowid").fetchall()

    def query(self) -> None:
        for row in self.query_all():
            print(row)

    def add_applet(self, trigger_device, trigger_condition, query_device, query_content,
                   action_device, action_action, is_pro, priority) -> None:
        pro_value = 1 if is_pro is True or str(is_pro).lower() == "true" else 0
        self.conn.execute(
            "INSERT INTO rule_table VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (trigger_device, trigger_condition, query_device, query_content,
             action_device, action_action, pro_value, int(priority)),
        )
        self.conn.commit()

    def close(self) -> None:
        self.conn.close()

    def __enter__(self):
        return self

    def __exit__(self, _exception_type, _exception, _traceback):
        self.close()
