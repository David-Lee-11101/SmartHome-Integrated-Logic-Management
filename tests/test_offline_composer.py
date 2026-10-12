import json
from contextlib import closing
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from applet_executor.external_config import load_ifttt_credentials
from applet_executor.offline_composer import compose_rule_spec
from applet_executor.sqlite_interface import SqliteInterface


class OfflineComposerTest(unittest.TestCase):
    def test_external_adapter_requires_explicit_opt_in_and_configuration(self):
        with patch.dict("os.environ", {}, clear=True):
            with self.assertRaisesRegex(RuntimeError, "disabled"):
                load_ifttt_credentials()
        with patch.dict("os.environ", {"IFTTT_ADAPTER_ENABLED": "true"}, clear=True):
            with self.assertRaisesRegex(RuntimeError, "Missing required IFTTT configuration"):
                load_ifttt_credentials()

    def test_composes_deterministic_v0_rule_spec_without_network(self):
        fixture = Path(__file__).parent / "fixtures" / "rule-spec-v0.json"

        first = compose_rule_spec(fixture)
        second = compose_rule_spec(fixture)

        self.assertEqual(first, second)
        self.assertEqual("rule-spec/v0", first["schema"])
        self.assertEqual(1, len(first["triggers"]))
        self.assertEqual(1, len(first["conditions"]))
        self.assertEqual(1, len(first["actions"]))
        self.assertNotIn("token", json.dumps(first).lower())

    def test_sqlite_round_trip_preserves_quotes(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            database = Path(temporary_directory) / "rules.db"
            store = SqliteInterface(database)
            store.add_applet(
                "office's sensor",
                "temperature > 30",
                "office",
                "occupancy = true",
                "air-conditioner",
                "set mode to 'cool'",
                False,
                10,
            )

            rows = store.query_all()
            store.close()

        self.assertEqual("office's sensor", rows[0][0])
        self.assertEqual("set mode to 'cool'", rows[0][5])

    def test_schema_mismatch_fails_without_destroying_existing_table(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            database = Path(temporary_directory) / "legacy.db"
            with closing(sqlite3.connect(str(database))) as connection:
                connection.execute(
                    """CREATE TABLE rule_table(
                        trigger_device TEXT, trigger_condition TEXT, query_device TEXT,
                        query_content TEXT, action_device TEXT, action_execution TEXT,
                        is_pro INTEGER, priority INTEGER
                    )"""
                )
                original_row = ("sensor", "on", "room", "occupied", "lamp", "turn-on", 0, 5)
                connection.execute("INSERT INTO rule_table VALUES (?, ?, ?, ?, ?, ?, ?, ?)", original_row)
                connection.commit()

            with self.assertRaisesRegex(RuntimeError, "migration"):
                SqliteInterface(database)

            with closing(sqlite3.connect(str(database))) as connection:
                columns = connection.execute("PRAGMA table_info(rule_table)").fetchall()
                rows = connection.execute("SELECT * FROM rule_table").fetchall()
            self.assertIn("action_execution", [column[1] for column in columns])
            self.assertNotIn("action_action", [column[1] for column in columns])
            self.assertEqual([original_row], rows)

    def test_composer_rejects_shared_contract_violations(self):
        valid = {
            "id": "r1",
            "description": "demo",
            "triggers": [{"device": "sensor", "state": "on"}],
            "conditions": [],
            "actions": [{"device": "lamp", "state": "on"}],
        }
        invalid_documents = [
            dict(valid, description=""),
            dict(valid, triggers=[]),
            dict(valid, actions=[]),
            dict(valid, actions=[{"device": "lamp", "state": ""}]),
            dict(valid, extra="unsupported"),
        ]
        with tempfile.TemporaryDirectory() as temporary_directory:
            fixture = Path(temporary_directory) / "rule.json"
            for document in invalid_documents:
                fixture.write_text(json.dumps(document), encoding="utf-8")
                with self.assertRaises(ValueError):
                    compose_rule_spec(fixture)


if __name__ == "__main__":
    unittest.main()
