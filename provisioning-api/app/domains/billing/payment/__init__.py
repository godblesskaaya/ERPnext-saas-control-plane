import sys

import app.modules.billing.payment as _payment

globals().update(_payment.__dict__)
sys.modules[__name__] = _payment
