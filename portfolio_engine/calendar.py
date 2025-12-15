# portfolio_engine/calendar.py
"""
STDLIB RE-EXPORT SHIM

This file must re-export Python's stdlib calendar to prevent shadowing.
All portfolio calendar logic has been moved to trading_calendar.py.
"""

# Use __future__ absolute_import to ensure we get stdlib, not ourselves
from __future__ import absolute_import

# Get stdlib calendar via importlib to avoid any path confusion
import importlib.util
import sys

def _get_stdlib_calendar():
    """Load stdlib calendar directly, bypassing normal import."""
    # Find stdlib calendar (not this file)
    for path in sys.path:
        if 'site-packages' in path or path.endswith('/lib'):
            continue
        spec = importlib.util.find_spec('calendar')
        if spec and spec.origin and 'portfolio_engine' not in spec.origin:
            return importlib.util.module_from_spec(spec)
    
    # Fallback: temporarily remove ourselves from modules
    saved = sys.modules.pop('calendar', None)
    saved_pe = sys.modules.pop('portfolio_engine.calendar', None)
    
    try:
        import calendar as stdlib_cal
        return stdlib_cal
    finally:
        if saved is not None:
            sys.modules['calendar'] = saved
        if saved_pe is not None:
            sys.modules['portfolio_engine.calendar'] = saved_pe

_stdlib = _get_stdlib_calendar()

# Re-export all public symbols
day_abbr = _stdlib.day_abbr
day_name = _stdlib.day_name
month_abbr = _stdlib.month_abbr
month_name = _stdlib.month_name
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
timegm = _stdlib.timegm
MONDAY = _stdlib.MONDAY
TUESDAY = _stdlib.TUESDAY
WEDNESDAY = _stdlib.WEDNESDAY
THURSDAY = _stdlib.THURSDAY
FRIDAY = _stdlib.FRIDAY
SATURDAY = _stdlib.SATURDAY
SUNDAY = _stdlib.SUNDAY

__all__ = [
    'day_abbr', 'day_name', 'month_abbr', 'month_name',
    'Calendar', 'TextCalendar', 'HTMLCalendar',
    'LocaleTextCalendar', 'LocaleHTMLCalendar',
    'setfirstweekday', 'firstweekday', 'isleap', 'leapdays',
    'weekday', 'monthrange', 'monthcalendar', 'prmonth', 'month',
    'prcal', 'calendar', 'timegm',
    'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY',
]
