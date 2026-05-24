import os
import sys
import tempfile
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
TEST_DB = Path(tempfile.gettempdir()) / f"antiplagiarism-test-{uuid4().hex}.sqlite3"

os.environ.setdefault("DATABASE_URL", f"sqlite:///{TEST_DB.as_posix()}")
os.environ.setdefault("AUTO_INIT_DB", "0")

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
