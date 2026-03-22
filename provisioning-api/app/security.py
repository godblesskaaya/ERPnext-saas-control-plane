import sys

import app.modules.identity.security as _security

globals().update(_security.__dict__)
sys.modules[__name__] = _security
