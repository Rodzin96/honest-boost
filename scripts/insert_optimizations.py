import sqlite3
import os
import sys
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(sys.argv[0])), '..', 'data', 'database.sqlite')

items = [
    ('opt_000001', 'cpu-sched', 'system', 'performance', '1.0', 'applied'),
    ('opt_000002', 'ram-standby-clean', 'system', 'memory', '1.0', 'applied'),
    ('opt_000003', 'mouse-1000hz', 'system', 'peripheral', '1.0', 'applied'),
]

os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

cur.execute('''CREATE TABLE IF NOT EXISTS optimizations (
    id TEXT PRIMARY KEY,
    name TEXT,
    game TEXT,
    category TEXT,
    description TEXT,
    version TEXT,
    status TEXT,
    applied_at TEXT
)''')

now = datetime.utcnow().isoformat()
for item in items:
    cur.execute(
        'INSERT OR REPLACE INTO optimizations (id, name, game, category, description, version, status, applied_at) VALUES (?,?,?,?,?,?,?,?)',
        (item[0], item[1], item[2], item[3], item[1] + ' auto', item[4], item[5], now)
    )

conn.commit()
conn.close()
print('Inserted sample optimizations via Python sqlite3')
