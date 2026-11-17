# Graphit – Markdown-Editor, Projekte und Kanban

Graphit ist ein lokaler Arbeitsplatz für Projektdokumentation und Aufgaben. Die Anwendung benötigt keine Installation, kein Node.js und keine externen Bibliotheken; sie kann optional als Progressive Web App installiert werden.

## Als App installieren und offline nutzen

Für die Installation Graphit zuerst über `localhost` oder HTTPS öffnen. Einmalig kann zum Beispiel im Projektverzeichnis ein lokaler Server mit Python gestartet werden:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Anschließend `http://127.0.0.1:8765/` in Chrome oder Edge öffnen und im Browsermenü **App installieren** beziehungsweise das Installationssymbol in der Adressleiste auswählen. Die genaue Bezeichnung hängt vom Browser ab. Der erste Aufruf benötigt den laufenden Server, damit die App-Dateien für den Offline-Betrieb zwischengespeichert werden. Danach kann Graphit auch bei gestopptem Server gestartet werden, solange der Browser den Cache behält. Zum Beenden des Servers im Terminal `Strg+C` drücken. Alternativ kann Graphit über HTTPS bereitgestellt werden.

Die installierte App und der Browser verwenden dieselbe Adresse und denselben Browser-Speicher. Eine andere Adresse oder Portnummer gilt als eigener Ursprung; Arbeitsbereich und Berechtigungen müssen dort gegebenenfalls erneut eingerichtet werden. Die Dokumente bleiben im gewählten lokalen Ordner und werden durch den Offline-Cache weder synchronisiert noch als Projektdateien gespeichert. Für externe Bilder und Links kann weiterhin eine Verbindung nötig sein. Ordnerzugriff und Installationsmöglichkeiten hängen vom Browser ab; eine PWA hebt diese Einschränkungen nicht auf.

Wenn ein App-Update bereitsteht, erscheint **Update verfügbar**. Nach dem Speichern aller Änderungen übernimmt ein Klick das Update und startet Graphit neu. Beim Start über `localhost` muss der Server für die Suche nach Updates und deren Download wieder laufen. Für die Entwicklung gilt: Bei jeder Änderung an den im Service Worker zwischengespeicherten App-Dateien die Cache-Version in `service-worker.js` erhöhen; der Browser lädt die neue Version dann bei einem erneuten Besuch und hält sie bis zur Bestätigung bereit.

## Start und Projektstruktur

`index.html` in einem aktuellen Browser öffnen. Über **Projektordner öffnen** einen Arbeitsbereich auswählen. Jeder direkte Unterordner ist ein Projekt; der aufklappbare Dateibaum zeigt alle Unterordner und Dateien. Markdown-Dateien lassen sich im Editor öffnen. Andere Dateien sind sichtbar, werden aber nicht bearbeitet. Neue Dokumente werden im Stamm des Arbeitsbereichs angelegt; über einen Wikilink angelegte Entwürfe entstehen im Ordner der Quelldatei.

Der Zugriff auf einen Ordner setzt einen Chromium-basierten Browser mit File System Access API und einen sicheren Kontext voraus. Falls das direkte Öffnen nicht funktioniert, die Anwendung über einen lokalen HTTP-Server auf `localhost` öffnen. Der Browser verwaltet die Ordnerberechtigungen und kann sie erneut anfordern. Ohne Ordnerzugriff lassen sich einzelne Dateien öffnen und als Download speichern; Projektbaum, Kanban und die arbeitsbereichsweite TODO-Übersicht benötigen einen geöffneten Ordner. Die Aktualisieren-Schaltfläche neben **Dateien** liest den Ordner erneut ein.

Graphit merkt sich den zuletzt erfolgreich geöffneten Arbeitsbereich lokal im Browserspeicher und öffnet ihn nach dem Neuladen wieder, sofern die Berechtigung noch besteht. Andernfalls erscheint **Letzten Arbeitsbereich wiederherstellen**, um den Zugriff erneut freizugeben. Wird der Browserspeicher gelöscht oder ist der Ordner nicht mehr verfügbar, muss er erneut ausgewählt werden. Der gespeicherte Zugriff gilt nur für dasselbe Browserprofil und dieselbe Adresse der Anwendung. Der Inhalt des Editors bleibt bei der Wiederherstellung erhalten. Zuletzt geöffnete Dateipfade werden pro Arbeitsbereich lokal gespeichert; geöffnete gespeicherte Dokument-Tabs werden wiederhergestellt. Ungespeicherte Entwürfe bleiben nur während der Sitzung erhalten. Neue, noch nicht gespeicherte Dateien müssen vor einem Arbeitsbereichswechsel gespeichert oder geschlossen werden.

Änderungen an bereits vorhandenen Dateien mit schreibbarem Dateizugriff werden nach einer kurzen Schreibpause automatisch gespeichert. Der Status in der Dokumentleiste zeigt ausstehende Änderungen, laufende Speicherung und Fehler. Wurde die Datei außerhalb von Graphit geändert, wird das automatische Speichern angehalten und der Entwurf bleibt im Editor erhalten. Über **Speichern** oder **Strg+S** (auf macOS **⌘S**) öffnet sich ein Vergleich: Du kannst den Entwurf speichern, die Dateiversion laden oder abbrechen. Ändert sich die Datei während des Vergleichs erneut, wird die aktualisierte Version angezeigt. Ein Konflikt in einem Hintergrund-Tab wird am Tab markiert und nach Auswahl des Tabs über **Speichern** gelöst. Während eines Speichervorgangs wird der Dokumentwechsel kurz gesperrt. Vor dem Verwerfen ungespeicherter Änderungen wird gewarnt.

Neue Dokumente müssen zunächst ausdrücklich gespeichert werden. Eine über den einfachen Dateidialog geöffnete Datei kann mangels schreibbarem Dateizugriff weiterhin nur als Download gespeichert werden; für diese Fälle erfolgt kein automatischer Download. Das Begrüßungsdokument ist ein bearbeitbares Beispiel.

## Arbeiten mit Dokumenten

Über das Symbol ◐ in der Dokumentleiste wechselst du zwischen hellem und dunklem Design. Beim ersten Start richtet sich Graphit nach dem Systemdesign; deine Auswahl wird lokal gespeichert. Die Schaltflächen **Live**, **Editor**, **Geteilt** und **Vorschau** bestimmen die Dokumentansicht. Live formatiert Überschriften und gängige Inline-Auszeichnungen im Textfeld, während die bearbeitete Zeile ihre Syntax zeigt; komplexere Markdown-Strukturen bleiben als Quelltext sichtbar. Das zugrunde liegende Markdown bleibt beim Kopieren und Speichern erhalten. Im geteilten Modus kann der Trenner mit der Maus oder per Pfeiltasten verschoben werden; die Seitenleiste lässt sich über das Menü ein- und ausblenden. Ansichtsmodus, Teilung, Seitenleiste, Zeilennummern und Gliederung merkt sich Graphit lokal im Browser. Die Tabs **Kanban** und **TODOs** öffnen die jeweilige Projektansicht. Dokument-Tabs halten ihre Entwürfe und ihren eigenen Rückgängig-Verlauf bereit. Mit dem Stern lassen sich gespeicherte Dokumente als Favoriten markieren.

Mit **Strg+Umschalt+P** (macOS **⌘+Umschalt+P**) öffnet sich die Befehlspalette. Mit **Strg+P** (macOS **⌘P**) öffnet sich die Suche über Dateinamen, Pfade und Inhalte im Arbeitsbereich. Ohne Suchtext zeigt sie zuletzt geöffnete Dateien; Inhaltstreffer führen zur betreffenden Zeile und berücksichtigen den aktuellen Editorstand. Nicht lesbare Dateien können nicht durchsucht werden. Die Gliederung springt zu Markdown-Überschriften, und die Editorleiste fügt Formatierung ein. **Strg/⌘+B**, **Strg/⌘+I** und **Strg/⌘+K** formatieren Auswahl als fett, kursiv beziehungsweise Link.

Tags wie `#idee` oder `#projekt/planung` lassen sich direkt im Text verwenden. Beim Tippen schlägt der Editor vorhandene Tags vor; Pfeiltasten und Eingabetaste wählen einen Vorschlag aus, Escape schließt die Liste. Tags können auch im YAML-Header als `tags: idee`, als Liste `tags: [idee, projekt/planung]` oder als mehrzeilige Liste unter `tags:` stehen. YAML-Werte dürfen einfach oder doppelt zitiert sein; die Tag-Auswertung unterstützt diese gängigen Formen, aber kein vollständiges YAML. Namen dürfen Buchstaben, Ziffern, Unterstriche und Bindestriche enthalten und nicht nur aus Ziffern bestehen. `/` trennt Untertags.

Die Ansicht **Tags** zeigt alle Tags im Arbeitsbereich und die Anzahl der zugehörigen Dateien. Wähle ein Tag, um die Dateien zu öffnen; bei übergeordneten Tags sind Untertags eingeschlossen. Tags in der Vorschau öffnen dieselbe Ansicht. Groß- und Kleinschreibung wird beim Vergleich ignoriert. Ungespeicherte Änderungen in geöffneten Tabs fließen in die Übersicht ein; Tags in Code, URLs und Linkzielen werden nicht erfasst. Nicht lesbare Dateien fehlen in der Übersicht.

## Kanban-Tickets

Im Tab **Kanban** ein Projekt auswählen und mit **＋ Ticket** ein Ticket samt Priorität anlegen. Das Board lässt sich nach Priorität filtern. Es wird unter `Projektname/tickets/` als eigene Markdown-Datei gespeichert. Ein Klick auf die Karte öffnet diese im Editor. Beispiel:

```markdown
---
title: "Dokumentation schreiben"
status: offen
priority: mittel
---

Die Projektanleitung ergänzen.
```

Die Felder `title`, `status` und `priority` sind erforderlich. Der Titel ist ein einfacher YAML-Textwert (unquotiert, einfach oder JSON-kompatibel doppelt zitiert); für Sonderzeichen empfiehlt sich doppelte Zitierung. Erlaubte Statuswerte: `offen`, `in_arbeit`, `erledigt`. Erlaubte Prioritäten: `niedrig`, `mittel`, `hoch`. Weitere Header-Zeilen bleiben erhalten. Graphit unterstützt bewusst nur diese einfachen YAML-Werte, kein vollständiges YAML. Ungültige oder nicht lesbare Ticketdateien erscheinen mit Hinweis unter dem Board.

Tickets lassen sich per Drag-and-drop oder mit den Pfeiltasten der Karte zwischen den festen Spalten verschieben. Dabei wird der Status sofort in der Ticketdatei gespeichert. Der Rest der Datei bleibt erhalten. Ungespeicherte Änderungen am selben Ticket müssen zuvor gespeichert oder verworfen werden. Tickets werden innerhalb der Spalten nach Titel sortiert. Bereits vorhandene `kanban:start`-Bereiche werden nicht automatisch umgewandelt.

## TODO-Übersicht und Markdown

Der Tab **TODOs** sammelt offene Markdown-Checkboxen wie `- [ ] Aufgabe` aus den lesbaren Markdown-Dateien und gruppiert sie nach Projekt. Die Übersicht lässt sich nach Projekt und Datei filtern. Ein Klick auf die Aufgabe öffnet die Quelldatei; ein Klick auf ihre Checkbox erledigt sie und speichert die Änderung nach den üblichen Speicherregeln. Erledigte Checkboxen und Aufgaben in Codeblöcken erscheinen nicht. Der Inhalt des aktuell geöffneten Dokuments wird auch vor dem Speichern berücksichtigt.

Die Vorschau unterstützt Überschriften, Absätze, Listen, Checkboxen, Links, Bilder, Fett- und Kursivschrift, Zitate, Trennlinien und Codeblöcke. Ein Klick auf eine Checkbox ändert die zugehörige Markdown-Zeile im Editor; es gelten dieselben Speicherregeln wie für andere Änderungen. HTML wird als Text angezeigt. Die Vorschau ist eine bewusst einfache Markdown-Implementierung und unterstützt nicht alle Markdown-Sonderfälle.

Die Anwendung arbeitet lokal und synchronisiert keine Dateien. Externe Bilder und Links können beim Aufruf dennoch Netzwerkverbindungen auslösen.

## Verknüpfungen und Backlinks

Unter der Vorschau erscheinen Backlinks: Markdown-Dateien im geöffneten Arbeitsbereich, die auf das aktuelle Dokument verweisen. Ein Klick auf einen Eintrag öffnet die Quelldatei an der betreffenden Zeile. Die Übersicht berücksichtigt ungespeicherte Änderungen der aktuell geöffneten Datei; mit **Dateien aktualisieren** werden externe Änderungen neu eingelesen.

Lokale Markdown-Links wie `[Konzept](dokumentation/konzept.md)` und Wikilinks wie `[[konzept]]` oder `[[dokumentation/konzept]]` öffnen ihr Ziel im Editor. Wikilinks unterstützen auch eine Beschriftung wie `[[konzept|Zum Konzept]]`. Ein Wikilink ohne Pfad muss im ganzen Arbeitsbereich eindeutig sein; bei mehrfach vorkommenden Dateinamen einen relativen Pfad angeben, etwa `[[./konzept]]` oder `[[../anderes-projekt/konzept]]`. Pfade werden relativ zur Quelldatei aufgelöst. Groß- und Kleinschreibung wird beachtet; Leerzeichen in Markdown-Linkpfaden als `%20` schreiben. Ankerfragmente springen zur entsprechenden Überschrift; auch dokumentinterne Links wie `[Abschnitt](#abschnitt)` und Wikilinks mit Ankern funktionieren. Die Anker verwenden kleingeschriebene Überschriften mit Bindestrichen für Leerzeichen; doppelte Anker erhalten `-1`, `-2` usw. Nicht gefundene Anker werden markiert.

Nicht gefundene, mehrdeutige und nicht lesbare Ziele werden in der Vorschau gekennzeichnet. Bilder, externe Links sowie Links in Codeblöcken und Inline-Code erzeugen keine Backlinks. Die Erkennung unterstützt die oben gezeigten einfachen Inline-Linkformate, keine Markdown-Referenzlinks. Für Backlinks und lokale Navigation muss ein Arbeitsbereich geöffnet und das Dokument daraus ausgewählt sein.

Beim Tippen von `[[` schlägt Graphit passende Dateien vor. Bei mehrfach vorkommenden Namen fügt die Auswahl einen eindeutigen relativen Pfad ein. Ein fehlendes Ziel kann als neuer Entwurf im Ordner der aktuellen Datei geöffnet und anschließend gespeichert werden.


## Projektübersicht und Schnellerfassung

Der Tab **Projekte** zeigt für das ausgewählte Projekt offene Tickets, Markdown-Aufgaben, zuletzt auf dem Datenträger geänderte Dokumente und Links aus der Projekt-README. Die Übersicht nutzt auch geöffnete Entwürfe; Dateidaten und externe Änderungen werden beim Aktualisieren des Arbeitsbereichs eingelesen. Unter Dokumenten erscheinen zugehörige Tickets und unter Tickets zugehörige Dokumente, wenn eines davon per unterstütztem Markdown- oder Wikilink auf das andere verweist.

Mit **Schnell erfassen**, der Befehlspalette oder **Strg+Alt+N** (macOS **⌘+Alt+N**) lässt sich eine Notiz oder Aufgabe in `Inbox.md` im Stamm des Arbeitsbereichs speichern. Aufgaben werden als Markdown-Checkboxen angelegt und erscheinen in der TODO-Übersicht. Die Inbox kann anschließend von Hand sortiert werden. Bei einem ungespeicherten Inbox-Tab oder einer externen Änderung bleibt die Eingabe im Dialog erhalten.

## Dateien umbenennen

Über das Stiftsymbol im Dateibaum lassen sich gespeicherte Markdown-Dateien innerhalb ihres Ordners umbenennen. Graphit zeigt Dateien mit betroffenen Links und bietet deren Aktualisierung an. Unterstützt werden die auch sonst erkannten Inline-Markdown- und Wikilinks; Beschriftungen und Anker bleiben erhalten. Ungespeicherte betroffene Dateien müssen vorher gespeichert oder geschlossen werden. Bei Lesefehlern ist das Umbenennen gesperrt. Dateioperationen über die Browser-API sind nicht transaktional: Falls ein Schritt fehlschlägt, nennt Graphit vorhandene Kopien und bereits aktualisierte Dateien, damit du sie prüfen kannst.

## PARA-Arbeitsbereich initialisieren

Öffne einen leeren Ordner und wähle in der Befehlspalette **Arbeitsbereich mit PARA initialisieren**. Graphit erstellt eine `index.md` sowie die Ordner Projekte, Bereiche, Ressourcen und Archiv mit erklärenden Beispielen. Unter `Projekte` erhält jedes Projekt einen eigenen Ordner für Projektübersicht und Kanban. Die Datei `.graphit.json` kennzeichnet den Arbeitsbereich als PARA-Arbeitsbereich. Bei einem Fehler nennt Graphit bereits angelegte Dateien; diese können geprüft und bei Bedarf manuell entfernt werden.

## Präsentationsmodus

Mit **Präsentieren** oder dem Befehl **Präsentation starten** wird der aktuelle Editorstand als Folien angezeigt. Überschriften `#` und `##` sowie eine eigene Zeile `---` beginnen eine neue Folie. Ein abgeschlossener YAML-Header am Anfang wird ausgelassen; Trennzeichen in Codeblöcken bleiben erhalten. Längere Folien lassen sich scrollen.

Die Pfeiltasten, Bild-auf/Bild-ab und die Schaltflächen wechseln die Folie; die Leertaste geht vorwärts. Escape oder **Beenden** schließt die Präsentation. Graphit versucht, den Browser-Vollbildmodus zu öffnen; andernfalls füllt die Präsentation das App-Fenster. Checkboxen sind während der Präsentation schreibgeschützt.

## Bilder und Tabellen

In einem gespeicherten Dokument können PNG-, JPEG-, GIF-, WebP-, AVIF- und BMP-Bilder über die Zwischenablage oder per Drag-and-drop in den Editor eingefügt werden. In Arbeitsbereichen werden sie im Unterordner `attachments` neben dem Dokument gespeichert. In einzeln geöffneten Dokumenten werden sie als Daten-URL in das Markdown eingebettet. Neue Dokumente müssen vor dem Einfügen zuerst gespeichert werden. Die Einfügung erfolgt an der aktuellen Cursorposition.

Die Vorschau unterstützt Markdown-Tabellen mit links-, rechts- und zentriert ausgerichteten Spalten. Die Markdown-Unterstützung ist weiterhin auf die dokumentierten Formate begrenzt.
