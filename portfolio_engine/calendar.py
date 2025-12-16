# portfolio_engine/calendar.py
# ============================================================
# ⚠️ STDLIB SHIM - Fixes path resolution for stdlib calendar
# ============================================================
# This file exists in portfolio_engine/ and can shadow Python's
# stdlib 'calendar' module when running scripts from this directory.
#
# SOLUTION: Fix sys.path at import time, before any other imports.
# ============================================================

# CRITICAL: This block must execute before ANY other imports
# to prevent recursion when OpenAI/httpx imports stdlib calendar
import sys as _sys

# Remove current directory and portfolio_engine from path temporarily
_original_path = _sys.path.copy()
_paths_to_remove = []

for _p in _sys.path:
    if _p.endswith('portfolio_engine') or _p == '':
        _paths_to_remove.append(_p)

for _p in _paths_to_remove:
    if _p in _sys.path:
        _sys.path.remove(_p)

# Now we can safely import from stdlib
try:
    # Import the real stdlib calendar (it will be found now)
    import importlib
    _stdlib_calendar = importlib.import_module('calendar')
finally:
    # Restore original path
    _sys.path = _original_path

# Re-export everything from stdlib calendar
timegm = _stdlib_calendar.timegm
Calendar = _stdlib_calendar.Calendar
TextCalendar = _stdlib_calendar.TextCalendar
HTMLCalendar = _stdlib_calendar.HTMLCalendar
LocaleTextCalendar = _stdlib_calendar.LocaleTextCalendar
LocaleHTMLCalendar = _stdlib_calendar.LocaleHTMLCalendar
setfirstweekday = _stdlib_calendar.setfirstweekday
firstweekday = _stdlib_calendar.firstweekday
isleap = _stdlib_calendar.isleap
leapdays = _stdlib_calendar.leapdays
weekday = _stdlib_calendar.weekday
monthrange = _stdlib_calendar.monthrange
monthcalendar = _stdlib_calendar.monthcalendar
prmonth = _stdlib_calendar.prmonth
month = _stdlib_calendar.month
prcal = _stdlib_calendar.prcal
calendar = _stdlib_calendar.calendar
month_name = _stdlib_calendar.month_name
month_abbr = _stdlib_calendar.month_abbr
day_name = _stdlib_calendar.day_name
day_abbr = _stdlib_calendar.day_abbr
MONDAY = _stdlib_calendar.MONDAY
TUESDAY = _stdlib_calendar.TUESDAY
WEDNESDAY = _stdlib_calendar.WEDNESDAY
THURSDAY = _stdlib_calendar.THURSDAY
FRIDAY = _stdlib_calendar.FRIDAY
SATURDAY = _stdlib_calendar.SATURDAY
SUNDAY = _stdlib_calendar.SUNDAY

__all__ = [
    'timegm', 'Calendar', 'TextCalendar', 'HTMLCalendar',
    'LocaleTextCalendar', 'LocaleHTMLCalendar', 'setfirstweekday',
    'firstweekday', 'isleap', 'leapdays', 'weekday', 'monthrange',
    'monthcalendar', 'prmonth', 'month', 'prcal', 'calendar',
    'month_name', 'month_abbr', 'day_name', 'day_abbr',
    'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY',
    'SATURDAY', 'SUNDAY',
]
