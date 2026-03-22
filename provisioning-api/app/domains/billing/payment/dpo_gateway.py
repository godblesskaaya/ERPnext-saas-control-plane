import sys

import app.modules.billing.payment.dpo_gateway as _dpo

globals().update(_dpo.__dict__)
sys.modules[__name__] = _dpo
