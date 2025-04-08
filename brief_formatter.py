def format_brief_data(brief_data):
    """Formate les données du résumé d'actualités pour le prompt."""
    if not brief_data or not isinstance(brief_data, dict):
        return "Aucun résumé d'actualités disponible"
    
    summary = ["📋 RÉSUMÉ COMPLET DE L'ACTUALITÉ FINANCIÈRE:"]
    
    # Extraction du résumé général si disponible
    if "summary" in brief_data and brief_data["summary"]:
        summary.append(f"📊 Vue d'ensemble: {brief_data['summary']}")
    
    # Extraction des points clés
    if "key_points" in brief_data and isinstance(brief_data["key_points"], list):
        summary.append("🔑 Points clés:")
        for point in brief_data["key_points"]:
            summary.append(f"• {point}")
    
    # Extraction des événements importants
    if "events" in brief_data and isinstance(brief_data["events"], list):
        summary.append("📅 Événements importants:")
        for event in brief_data["events"]:
            if isinstance(event, dict):
                event_date = event.get("date", "")
                event_desc = event.get("description", "")
                event_impact = event.get("impact", "")
                summary.append(f"• {event_date}: {event_desc} (Impact: {event_impact})")
            elif isinstance(event, str):
                summary.append(f"• {event}")
    
    # Extraction des analyses sectorielles
    if "sector_analysis" in brief_data and isinstance(brief_data["sector_analysis"], dict):
        summary.append("🏭 Analyse sectorielle:")
        for sector, analysis in brief_data["sector_analysis"].items():
            summary.append(f"• {sector}: {analysis}")
    
    # Extraction des tendances régionales
    if "regional_trends" in brief_data and isinstance(brief_data["regional_trends"], dict):
        summary.append("🌍 Tendances régionales:")
        for region, trend in brief_data["regional_trends"].items():
            summary.append(f"• {region}: {trend}")
    
    # Extraction des impacts macro-économiques
    if "macro_impacts" in brief_data and isinstance(brief_data["macro_impacts"], dict):
        summary.append("💹 Impacts macro-économiques:")
        for factor, impact in brief_data["macro_impacts"].items():
            summary.append(f"• {factor}: {impact}")
    
    # Extraction des recommandations ou perspectives
    if "outlook" in brief_data and isinstance(brief_data["outlook"], dict):
        summary.append("🔮 Perspectives:")
        for timeframe, outlook in brief_data["outlook"].items():
            summary.append(f"• {timeframe}: {outlook}")
    
    return "\n".join(summary)
