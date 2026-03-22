import sys

import app.modules.tenant.state as _state

globals().update(_state.__dict__)
sys.modules[__name__] = _state
