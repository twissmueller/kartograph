---
name: kartograph-migrate
description: Use when a Kartograph skill stopped because the project is on an older Kartograph layout, after updating the Kartograph plugin, or when the person asks to migrate a project to the current Kartograph version.
---

# Kartograph Migrate

Bring a project's Kartograph files onto this plugin's layout, in one step and one commit,
whatever version the project comes from. **Fully automated: ask nothing, wait for
nothing.**

## Hard rules

- Change only Kartograph's own files: `kartograph/`, `intents/`, `features/`, `knowledge/`,
  and what a migration document names. Never code; never a scenario's steps or title.
- Reach the final target state directly. Never replay versions one by one, never write an
  intermediate layout a later version changes again.
- Never invent. What a migration cannot derive is noted in `kartograph/log.md` and
  reported, never filled in.
- One commit for the whole migration. Never commit a result the validators reject.

## 1. Check

The plugin root is two levels above this file's directory. In the project, run
`node <plugin root>/scripts/migrate-kartograph.js . --check`. It prints the project's
layout version (`new` when there are no Kartograph files at all), the plugin's layout
version, and the pending migration documents. `new`, or `pending: none`: say the project
is up to date and stop.

## 2. Read the pending documents

Read every pending `migrations/<version>.md` at the plugin root, oldest first. Each states
the **Target state** after that version, how to **Recognise** a project that is not there,
and what to **Do**. The goal is the newest document's target state together with every
earlier target state it does not replace. Of the *Do* steps, keep only those that still
matter for that goal: a step a later version redoes or undoes is dropped.

## 3. Migrate

In the project, run `node <plugin root>/scripts/migrate-kartograph.js .`. It performs every
mechanical step of every pending version at once, writing the newest layout directly, and
prints what it wrote, what it removed, and every validator error left. Then carry out the
judgment steps the documents name, merged as in step 2. Fix each remaining validator error
by hand with the smallest correction that keeps the file's meaning; what cannot be fixed
without inventing is noted in `kartograph/log.md` under today's migration line. Re-run the
validators the script names until none reports an error:
`node <plugin root>/skills/kartograph-migrate/validate-kartograph.js kartograph`,
`node <plugin root>/skills/kartograph-intent/validate-intent.js`,
`node <plugin root>/skills/kartograph-features/validate-features.js features` and
`node <plugin root>/skills/kartograph-knowledge/validate-knowledge.js knowledge` for the
directories that exist.

## 4. Verify, commit, push, report

Run the check again: it must print `pending: none`. Run `git status` and confirm that only
the files the migration names changed. Stage exactly those, commit once as
`chore: migrate to kartograph <layout version>`, and push to the branch's upstream. No git
or no upstream: skip and say so. Report the versions (from → to), the moved and rewritten
files by count, and every note left in the log. Then you are done.
