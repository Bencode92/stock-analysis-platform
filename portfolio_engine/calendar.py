# portfolio_engine/calendar.py
# ============================================================
# ⚠️ STDLIB PROXY - LOADS STANDARD LIBRARY CALENDAR DIRECTLY
# ============================================================
# This file shadows Python's stdlib 'calendar' module.
# We load the real stdlib version from its physical location
# to avoid infinite recursion.
# ============================================================

import sys
import importlib.util
import sysconfig

def _load_stdlib_calendar():
    """Load the real stdlib calendar module from its file location."""
    # Get Python's standard library path
    stdlib_path = sysconfig.get_path('stdlib')
    calendar_path = f"{stdlib_path}/calendar.py"
    
    # Load the module directly from file
    spec = importlib.util.spec_from_file_location("_stdlib_calendar", calendar_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot find stdlib calendar at {calendar_path}")
    
    module = importlib.util.module_from_spec(spec)
    
    # Temporarily add to sys.modules to handle any internal imports
    sys.modules['_stdlib_calendar'] = module
    spec.loader.exec_module(module)
    
    return module

# Load the real stdlib calendar
_stdlib = _load_stdlib_calendar()

# Re-export all public names
timegm = _stdlib.timegm
Calendar = _stdlib.Calendar
TextCalendar = _stdlib.TextCalendar
HTMLCalendar = _stdlib.HTMLCalendar
LocaleTextCalendar = _stdlib.LocaleTextCalendar
LocaleHTMLCalendar = _stdlib.LocaleHTMLCalendar
setfirstweekday = _stdlib.setfirstweekday
firstweekday = _stdlib.firstweekday
isleap = _stdlib.isleap
leapdays = _stdlib.leapdays
weekday = _stdlib.weekday
monthrange = _stdlib.monthrange
monthcalendar = _stdlib.monthcalendar
prmonth = _stdlib.prmonth
month = _stdlib.month
prcal = _stdlib.prcal
calendar = _stdlib.calendar
month_name = _stdlib.month_name
month_abbr = _stdlib.month_abbr
day_name = _stdlib.day_name
day_abbr = _stdlib.day_abbr
MONDAY = _stdlib.MONDAY
TUESDAY = _stdlib.TUESDAY
WEDNESDAY = _stdlib.WEDNESDAY
THURSDAY = _stdlib.THURSDAY
FRIDAY = _stdlib.FRIDAY
SATURDAY = _stdlib.SATURDAY
SUNDAY = _stdlib.SUNDAY

# Support wildcard imports
__all__ = [
    'timegm', 'Calendar', 'TextCalendar', 'HTMLCalendar',
    'LocaleTextCalendar', 'LocaleHTMLCalendar', 'setfirstweekday',
    'firstweekday', 'isleap', 'leapdays', 'weekday', 'monthrange',
    'monthcalendar', 'prmonth', 'month', 'prcal', 'calendar',
    'month_name', 'month_abbr', 'day_name', 'day_abbr',
    'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY',
    'SATURDAY', 'SUNDAY',
]
