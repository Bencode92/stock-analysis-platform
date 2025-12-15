# portfolio_engine/calendar.py
"""
COMPATIBILITY SHIM - Re-exports Python stdlib calendar.

This file exists to prevent shadowing Python's standard library 'calendar' module.
All functionality has been moved to trading_calendar.py.

For portfolio calendar functions, use:
    from portfolio_engine.trading_calendar import align_to_reference_calendar

This shim re-exports stdlib calendar to prevent import errors in dependencies
like OpenAI SDK that expect the standard library module.
"""
import sys as _sys
import importlib as _importlib

# Remove this module from cache to allow stdlib import
_current_module = _sys.modules.pop(__name__, None)

# Import the real stdlib calendar
import calendar as _stdlib_calendar

# Restore this module
if _current_module is not None:
    _sys.modules[__name__] = _current_module

# Re-export everything from stdlib calendar
from calendar import (
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

# Deprecation warning for direct use
import warnings as _warnings
_warnings.warn(
    "portfolio_engine.calendar is deprecated. "
    "Use portfolio_engine.trading_calendar for portfolio functions, "
    "or import calendar directly for stdlib calendar.",
    DeprecationWarning,
    stacklevel=2
)

__all__ = [
    'Calendar', 'TextCalendar', 'HTMLCalendar', 
    'LocaleTextCalendar', 'LocaleHTMLCalendar',
    'setfirstweekday', 'firstweekday', 'isleap', 'leapdays',
    'weekday', 'monthrange', 'monthcalendar', 'prmonth', 'month',
    'prcal', 'calendar', 'timegm',
    'month_name', 'month_abbr', 'day_name', 'day_abbr',
    'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY',
]
