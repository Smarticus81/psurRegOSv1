"""Database migrations for SQLite."""

import sqlite3
from pathlib import Path


def init_db(db_path: Path) -> None:
    """Initialize the database with all required tables."""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS regulatory_sources (
            id TEXT PRIMARY KEY,
            jurisdiction TEXT NOT NULL,
            instrument TEXT,
            effective_date TEXT,
            title TEXT,
            data TEXT NOT NULL
        )
    """)
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS compiled_obligations (
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            compiled_at TEXT NOT NULL
        )
    """)
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS compiled_rules (
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            compiled_at TEXT NOT NULL
        )
    """)
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS templates (
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL
        )
    """)
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS mappings (
            id TEXT PRIMARY KEY,
            template_id TEXT NOT NULL,
            data TEXT NOT NULL,
            FOREIGN KEY (template_id) REFERENCES templates(id)
        )
    """)
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS evidence_atoms (
            id TEXT PRIMARY KEY,
            evidence_type TEXT NOT NULL,
            data TEXT NOT NULL
        )
    """)
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS proposals (
            id TEXT PRIMARY KEY,
            slot_id TEXT NOT NULL,
            data TEXT NOT NULL
        )
    """)
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS adjudications (
            id TEXT PRIMARY KEY,
            proposal_id TEXT NOT NULL,
            status TEXT NOT NULL,
            data TEXT NOT NULL,
            FOREIGN KEY (proposal_id) REFERENCES proposals(id)
        )
    """)
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS trace_nodes (
            id TEXT PRIMARY KEY,
            adjudication_id TEXT NOT NULL,
            slot_id TEXT NOT NULL,
            data TEXT NOT NULL,
            FOREIGN KEY (adjudication_id) REFERENCES adjudications(id)
        )
    """)
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS psur_periods (
            id TEXT PRIMARY KEY,
            psur_ref TEXT NOT NULL,
            start_date TEXT NOT NULL,
            end_date TEXT NOT NULL,
            jurisdiction TEXT NOT NULL,
            device_class TEXT
        )
    """)
    
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_evidence_type ON evidence_atoms(evidence_type)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_adjudication_status ON adjudications(status)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_trace_adjudication ON trace_nodes(adjudication_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_psur_ref ON psur_periods(psur_ref)")
    
    conn.commit()
    conn.close()


def reset_db(db_path: Path) -> None:
    """Reset database by dropping and recreating all tables."""
    if db_path.exists():
        db_path.unlink()
    init_db(db_path)
