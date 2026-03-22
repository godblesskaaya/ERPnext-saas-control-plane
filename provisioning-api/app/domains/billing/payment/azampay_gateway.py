import sys

import app.modules.billing.payment.azampay_gateway as _azampay

globals().update(_azampay.__dict__)
sys.modules[__name__] = _azampay
