# ⚠️ DEPRECATED - DO NOT USE
# This file was renamed to trading_calendar.py to avoid shadowing Python's stdlib calendar module
# See: https://github.com/Bencode92/stock-analysis-platform/issues/XXX
#
# Import from the new location:
# from portfolio_engine.trading_calendar import align_to_reference_calendar

raise ImportError(
    "portfolio_engine.calendar has been renamed to portfolio_engine.trading_calendar "
    "to avoid shadowing Python's standard library calendar module. "
    "Please update your imports: from portfolio_engine.trading_calendar import ..."
)
