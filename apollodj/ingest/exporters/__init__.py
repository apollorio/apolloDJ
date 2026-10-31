"""apolloDJ — Universal Export writers.

One canonical Track produces all three DJ-ecosystem layouts:
    - rekordbox_xml  : Pioneer CDJ-native XML (works on CDJ-3000 USB)
    - serato_crates  : Serato DJ Pro crate files
    - universal_cdj  : raw PIONEER/USBANLZ + DJ Music/ folder layout
    - sidecar_export : reuse of ingest/sidecar.py .apollodj.json output
"""
