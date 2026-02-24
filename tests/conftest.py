"""Pytest configuration — adds src/ to the import path and provides
shared fixtures.
"""

import os
import sys

# Make src/ importable without installing as a package
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
