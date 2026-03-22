import sys

import app.modules.observability.logging as _logging

globals().update(_logging.__dict__)
sys.modules[__name__] = _logging
