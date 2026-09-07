#!/usr/bin/env python3
"""Read one active, immutable Skill snapshot from the plugin runtime database."""
import argparse
from contextlib import closing
import json
from pathlib import Path
import sqlite3


def read_active_skill(runtime_path: str, skill_id: str) -> dict:
    path = Path(runtime_path).expanduser().resolve(strict=True)
    # mode=ro prevents a typo from creating an unrelated empty SQLite database.
    with closing(sqlite3.connect(path.as_uri() + '?mode=ro', uri=True, timeout=5)) as connection:
        row = connection.execute('''
            SELECT version.payload_json
            FROM runtime_entities AS active
            JOIN runtime_entities AS version
              ON version.entity_type = 'release-version'
             AND version.entity_id = json_extract(active.payload_json, '$.releaseId')
            WHERE active.entity_type = 'active-release' AND active.entity_id = ?
        ''', (skill_id,)).fetchone()
    if row is None:
        raise LookupError(f'No active release for Skill {skill_id}')
    release = json.loads(row[0])
    release.setdefault('format', 'package')
    if release['format'] not in ('package', 'markdown'):
        raise ValueError('Unsupported Skill format')
    # Keep this returned release for the whole business request. Never resolve
    # the active pointer again halfway through executing the same request.
    return release


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('runtime_path')
    parser.add_argument('skill_id')
    args = parser.parse_args()
    print(json.dumps(read_active_skill(args.runtime_path, args.skill_id), ensure_ascii=False, indent=2))
