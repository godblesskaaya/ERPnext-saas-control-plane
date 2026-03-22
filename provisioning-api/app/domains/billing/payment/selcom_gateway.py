import sys

import app.modules.billing.payment.selcom_gateway as _selcom

globals().update(_selcom.__dict__)
sys.modules[__name__] = _selcom
