"""apolloDJ — Universal Export parsers.

Read existing DJ library formats into the canonical apolloDJ Track model:
    - pyrekordbox_in    : Rekordbox 6 DB + ANLZ files
    - serato_in         : Serato DJ Pro crates + database
    - serato2rekordbox  : cross-translation helper
    - track_model       : canonical dataclass (path / fingerprint / metadata)
"""
