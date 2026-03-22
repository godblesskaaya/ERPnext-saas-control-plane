import sys

import app.modules.notifications.service as _service

globals().update(_service.__dict__)
sys.modules[__name__] = _service
