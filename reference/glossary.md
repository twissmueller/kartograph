# Kartograph — Meta-Glossar

Die Grundbegriffe von Kartograph. Zehn Wörter, mit denen sich jede Anwendung
beschreiben lässt — die gemeinsame Sprache zwischen Mensch und KI. Jeder Begriff
zweisprachig: *Kanonisch (Übersetzung)*.

Mentales Modell: *Eine Anwendung nimmt Subjekte entgegen, transformiert sie nach
Regeln in andere Subjekte oder Ereignisse.*

## Akteur (Actor)
Wer die Anwendung benutzt oder mit ihr interagiert — ein Mensch in einer Rolle oder
ein externes System. Akteure lösen Capabilities aus und nehmen Subjekte oder
Ereignisse entgegen.

## Capability (Fähigkeit)
Eine Sache, die die Anwendung kann: nimmt Subjekte entgegen, transformiert sie nach
Regeln, produziert neue Subjekte oder Ereignisse. Hat einen Reifegrad und lebt in
genau einem Kontext. Besteht aus einem oder mehreren Features.

## Ereignis (Event)
Etwas Bemerkenswertes, das passiert ist (Vergangenheitsform). Hat einen Auslöser und
bezieht sich auf ein oder mehrere Subjekte. Andere Capabilities können darauf
reagieren.

## Feature (Funktion)
Ein lieferbares Stück einer Capability in fachlicher Sprache. Wird durch ein oder
mehrere Szenarien belegt und in `.feature`-Dateien (Gherkin) gespeichert.

## Glossar (Glossary)
Die Sammlung der Begriffe einer Anwendung mit Definitionen — Materialisierung der
gemeinsamen Sprache. Jeder Begriff in genau einer Form; Synonyme sind verboten.

## Kontext (Context)
Ein zusammenhängender Bereich der Anwendung. Innerhalb eines Kontexts gilt eine
konsistente Sprache.

## Regel (Rule)
Eine Bedingung, die immer gelten muss. Regeln gehören zu Subjekten und werden im Code
durch Validierungen, Constraints oder Domain-Logik durchgesetzt.

## Subjekt (Subject)
Eine Sache aus der Welt der Anwendung (Subject Matter), mit der Capabilities umgehen.
Wird im Code zu einer Datenklasse. Hat Identität und Eigenschaften; Regeln gelten für
sie. (Nicht der Handelnde — das ist der Akteur.)

## Szenario (Scenario)
Ein konkreter Beispielfall in Given-When-Then (Gherkin). Deckt Happy-Path, Edge Cases
und Error-Pfade ab. Spezifikation und ausführbarer Test zugleich. Der abgedeckte
Anteil bestimmt den Reifegrad.

## ADR (Architekturentscheidung / Architecture Decision Record)
Eine dokumentierte technische oder strukturelle Festlegung, die das *Wie* prägt, nicht
das *Was*. Hält Kontext, Entscheidung und Konsequenzen fest und hat einen Status
(Vorgeschlagen, Akzeptiert, Abgelöst, Verworfen). Kann sich auf Kontexte und
Capabilities beziehen und eine frühere ADR ablösen.
