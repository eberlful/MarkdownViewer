# Folio – Markdown-Editor, Projekte und Kanban

Folio ist ein lokaler Arbeitsplatz für Projektdokumentation und Aufgaben. Die Anwendung benötigt weder Installation noch Node.js oder externe Bibliotheken.

## Start und Projektstruktur

`index.html` in einem aktuellen Browser öffnen. Über **Projektordner öffnen** einen Arbeitsbereich auswählen. Jeder direkte Unterordner ist ein Projekt; der aufklappbare Dateibaum zeigt alle Unterordner und Dateien. Markdown-Dateien lassen sich im Editor öffnen. Andere Dateien sind sichtbar, werden aber nicht bearbeitet. Neue Dokumente werden im Stamm des Arbeitsbereichs angelegt.

Der Zugriff auf einen Ordner setzt einen Chromium-basierten Browser mit File System Access API und einen sicheren Kontext voraus. Falls das direkte Öffnen nicht funktioniert, die Anwendung über einen lokalen HTTP-Server auf `localhost` öffnen. Der Browser verwaltet die Ordnerberechtigungen und kann sie erneut anfordern. Ohne Ordnerzugriff lassen sich einzelne Dateien öffnen und als Download speichern; Projektbaum, Kanban und die arbeitsbereichsweite TODO-Übersicht benötigen einen geöffneten Ordner. Die Aktualisieren-Schaltfläche neben **Dateien** liest den Ordner erneut ein.

Folio merkt sich den zuletzt erfolgreich geöffneten Arbeitsbereich lokal im Browserspeicher und öffnet ihn nach dem Neuladen wieder, sofern die Berechtigung noch besteht. Andernfalls erscheint **Letzten Arbeitsbereich wiederherstellen**, um den Zugriff erneut freizugeben. Wird der Browserspeicher gelöscht oder ist der Ordner nicht mehr verfügbar, muss er erneut ausgewählt werden. Der gespeicherte Zugriff gilt nur für dasselbe Browserprofil und dieselbe Adresse der Anwendung. Der Inhalt des Editors bleibt bei der Wiederherstellung erhalten; zuletzt geöffnete Dateien und ungespeicherte Änderungen werden nicht sitzungsübergreifend wiederhergestellt.

Änderungen im Editor werden ausdrücklich mit **Speichern** oder **Strg+S** (auf macOS **⌘S**) gesichert. Vor dem Verwerfen ungespeicherter Änderungen wird gewarnt. Das Begrüßungsdokument ist ein bearbeitbares Beispiel.

## Kanban-Tickets

Im Tab **Kanban** ein Projekt auswählen und mit **＋ Ticket** ein Ticket anlegen. Es wird unter `Projektname/tickets/` als eigene Markdown-Datei gespeichert. Ein Klick auf die Karte öffnet diese im Editor. Beispiel:

```markdown
---
title: "Dokumentation schreiben"
status: offen
priority: mittel
---

Die Projektanleitung ergänzen.
```

Die Felder `title`, `status` und `priority` sind erforderlich. Der Titel ist ein einfacher YAML-Textwert (unquotiert, einfach oder JSON-kompatibel doppelt zitiert); für Sonderzeichen empfiehlt sich doppelte Zitierung. Erlaubte Statuswerte: `offen`, `in_arbeit`, `erledigt`. Erlaubte Prioritäten: `niedrig`, `mittel`, `hoch`. Weitere Header-Zeilen bleiben erhalten. Folio unterstützt bewusst nur diese einfachen YAML-Werte, kein vollständiges YAML. Ungültige oder nicht lesbare Ticketdateien erscheinen mit Hinweis unter dem Board.

Tickets lassen sich per Drag-and-drop oder mit den Pfeiltasten der Karte zwischen den festen Spalten verschieben. Dabei wird der Status sofort in der Ticketdatei gespeichert. Der Rest der Datei bleibt erhalten. Ungespeicherte Änderungen am selben Ticket müssen zuvor gespeichert oder verworfen werden. Tickets werden innerhalb der Spalten nach Titel sortiert. Bereits vorhandene `kanban:start`-Bereiche werden nicht automatisch umgewandelt.

## TODO-Übersicht und Markdown

Der Tab **TODOs** sammelt offene Markdown-Checkboxen wie `- [ ] Aufgabe` aus den lesbaren Markdown-Dateien und gruppiert sie nach Projekt. Ein Klick öffnet die Quelldatei an der entsprechenden Zeile. Erledigte Checkboxen und Aufgaben in Codeblöcken erscheinen nicht. Der Inhalt des aktuell geöffneten Dokuments wird auch vor dem Speichern berücksichtigt.

Die Vorschau unterstützt Überschriften, Absätze, Listen, Checkboxen, Links, Bilder, Fett- und Kursivschrift, Zitate, Trennlinien und Codeblöcke. HTML wird als Text angezeigt. Die Vorschau ist eine bewusst einfache Markdown-Implementierung und unterstützt nicht alle Markdown-Sonderfälle.

Die Anwendung arbeitet lokal und synchronisiert keine Dateien. Externe Bilder und Links können beim Aufruf dennoch Netzwerkverbindungen auslösen.

## Verknüpfungen und Backlinks

Unter der Vorschau erscheinen Backlinks: Markdown-Dateien im geöffneten Arbeitsbereich, die auf das aktuelle Dokument verweisen. Ein Klick auf einen Eintrag öffnet die Quelldatei an der betreffenden Zeile. Die Übersicht berücksichtigt ungespeicherte Änderungen der aktuell geöffneten Datei; mit **Dateien aktualisieren** werden externe Änderungen neu eingelesen.

Lokale Markdown-Links wie `[Konzept](dokumentation/konzept.md)` und Wikilinks wie `[[konzept]]` oder `[[dokumentation/konzept]]` öffnen ihr Ziel im Editor. Wikilinks unterstützen auch eine Beschriftung wie `[[konzept|Zum Konzept]]`. Ein Wikilink ohne Pfad muss im ganzen Arbeitsbereich eindeutig sein; bei mehrfach vorkommenden Dateinamen einen relativen Pfad angeben, etwa `[[./konzept]]` oder `[[../anderes-projekt/konzept]]`. Pfade werden relativ zur Quelldatei aufgelöst. Groß- und Kleinschreibung wird beachtet; Leerzeichen in Markdown-Linkpfaden als `%20` schreiben. Ankerfragmente werden für die Zuordnung ignoriert und beim Öffnen nicht angesprungen.

Nicht gefundene, mehrdeutige und nicht lesbare Ziele werden in der Vorschau gekennzeichnet. Bilder, externe Links sowie Links in Codeblöcken und Inline-Code erzeugen keine Backlinks. Die Erkennung unterstützt die oben gezeigten einfachen Inline-Linkformate, keine Markdown-Referenzlinks. Für Backlinks und lokale Navigation muss ein Arbeitsbereich geöffnet und das Dokument daraus ausgewählt sein.
