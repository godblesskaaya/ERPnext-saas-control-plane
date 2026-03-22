import sys

import app.modules.billing.payment.base as _base

globals().update(_base.__dict__)
sys.modules[__name__] = _base
