# portfolio_engine/calendar.py
# ============================================================
# ⚠️ STDLIB PROXY - RE-EXPORTS STANDARD LIBRARY CALENDAR
# ============================================================
# This file exists to prevent import errors when code tries to
# import from stdlib calendar but finds this file first due to
# Python's module resolution order.
#
# SOLUTION: Re-export everything from the standard library calendar
# ============================================================

import sys
import importlib

# Remove this module from sys.modules to allow reimport of stdlib
_current_module = sys.modules.pop(__name__, None)

# Import the real stdlib calendar
import calendar as _stdlib_calendar

# Restore this module
if _current_module is not None:
    sys.modules[__name__] = _current_module

# Re-export all public names from stdlib calendar
from calendar import (
    timegm,
    Calendar,
    TextCalendar,
    HTMLCalendar,
    LocaleTextCalendar,
    LocaleHTMLCalendar,
    setfirstweekday,
    firstweekday,
    isleap,
    leapdays,
    weekday,
    monthrange,
    monthcalendar,
    prmonth,
    month,
    prcal,
    calendar,
    timegm,
    month_name,
    month_abbr,
    day_name,
    day_abbr,
    MONDAY,
    TUESDAY,
    WEDNESDAY,
    THURSDAY,
    FRIDAY,
    SATURDAY,
    SUNDAY,
)

# Make all stdlib calendar attributes available
__all__ = dir(_stdlib_calendar)
