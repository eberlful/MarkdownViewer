---
name: graphit-inhalte
description: Erstelle oder bearbeite Markdown-Dokumente, Aufgaben und Kanban-Tickets in einem Graphit-Arbeitsbereich. Verwende diesen Skill für Inhalte in Graphit, nicht für Änderungen an der Graphit-Anwendung selbst.
---

# Graphit-Inhalte schreiben

Erstelle und bearbeite Inhalte direkt in den Dateien des gewünschten Graphit-Arbeitsbereichs. Prüfe zuerst den Arbeitsbereich, das betroffene Projekt und relevante vorhandene Dokumente; orientiere dich an deren Sprache, Stil und Struktur sowie den Vorgaben des Nutzers. Jeder direkte Unterordner des Arbeitsbereichs ist ein Projekt. Frage nach, wenn der Arbeitsbereich, das Zielprojekt oder wesentliche Inhalte nicht hinreichend eindeutig sind.

## Dokumente und Aufgaben

Schreibe Markdown passend zum Auftrag und zur vorhandenen Ablage. Graphits Vorschau unterstützt grundlegendes Markdown wie Überschriften, Listen, Links, Bilder, Auszeichnungen, Zitate und Codeblöcke; verlasse dich für die Darstellung nicht auf erweiterte Markdown-Funktionen. Formuliere offene Aufgaben als `- [ ] Aufgabe` und erledigte als `- [x] Aufgabe`. Offene Checkboxen außerhalb von Codeblöcken erscheinen in der TODO-Übersicht. Vermeide bei neuen Dateien Namenskollisionen und erhalte bei Änderungen bestehende, nicht betroffene Inhalte.

## Kanban-Tickets

Jedes Ticket ist eine eigene Markdown-Datei unter `Projektname/tickets/`. Verwende am Dateianfang genau einen einfachen Frontmatter-Block mit den erforderlichen Feldern, zum Beispiel:

```markdown
---
title: "Startseite entwerfen"
status: offen
priority: mittel
---

Einen ersten Entwurf für die Startseite erstellen.
```

- `title` ist ein nicht leerer, einzeiliger Text; verwende für neue Titel einen JSON-kompatibel doppelt zitierten String, damit Sonderzeichen gültig bleiben.
- `status` ist `offen`, `in_arbeit` oder `erledigt`; `priority` ist `niedrig`, `mittel` oder `hoch`. Nutze für neue Tickets `offen` und `mittel`, sofern der Auftrag nichts anderes vorgibt.
- Erhalte beim Bearbeiten bestehende Beschreibungen und zusätzliche Header-Zeilen, soweit der Auftrag ihre Änderung nicht verlangt. Lege neue Tickets unter freien Dateinamen an, statt vorhandene Dateien zu überschreiben.

Graphit verarbeitet nur einfache YAML-Textwerte, kein vollständiges YAML. Setze deshalb keine Listen oder verschachtelten Werte für die erforderlichen Felder ein und wiederhole diese Felder nicht.

## Abschluss

Prüfe die geänderten Inhalte auf die verlangte Aufgabe und auf Graphit-kompatible Syntax. Nenne die angelegten oder geänderten Dateien. Weise bei externen Änderungen darauf hin, dass sie in Graphit gegebenenfalls über **Dateien aktualisieren** eingelesen werden müssen; beachte mögliche ungespeicherte Änderungen im geöffneten Editor.
