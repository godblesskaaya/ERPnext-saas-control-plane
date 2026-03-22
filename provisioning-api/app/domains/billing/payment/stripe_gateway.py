import sys

import app.modules.billing.payment.stripe_gateway as _stripe

globals().update(_stripe.__dict__)
sys.modules[__name__] = _stripe
