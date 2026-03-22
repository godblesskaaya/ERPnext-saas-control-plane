import sys

import app.modules.audit.service as _service

globals().update(_service.__dict__)
sys.modules[__name__] = _service
