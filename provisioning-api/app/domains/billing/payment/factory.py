import sys

import app.modules.billing.payment.factory as _factory

globals().update(_factory.__dict__)
sys.modules[__name__] = _factory
