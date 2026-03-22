import sys

import app.modules.billing.router as _router

globals().update(_router.__dict__)
sys.modules[__name__] = _router
