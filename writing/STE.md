# STE-lite: the writing rules for generated text

The skills that write text for a person to read follow these rules: release notes, store
texts, review notes, the first-release checklist, capability descriptions, feature
descriptions, `Rule:` lines, scenario steps, concept bodies, and the descriptive text of
intents and mappings. The rules are a lite version of ASD-STE100 Simplified Technical
English (STE), in our own words. They do not copy the STE dictionary.

## When the rules apply

| Text | STE-lite |
|---|---|
| Text that a skill writes in English | Yes. |
| Text in another language (a project whose feature, UI or store language is not English, a `# language:` file, a German locale) | No. STE is for English only. |
| The person's words quoted verbatim (conversation blocks, walk answers, revision blocks, quotes in an intent or a concept) | No. A quote stays as the person said it. |
| Code, identifiers, paths, keys, links, numbers, UI strings in quotes, Gherkin keywords | No change. |
| Existing text that the skill does not change (for example the steps of an unchanged scenario) | No. The text follows the rules when a skill writes it again. |

## The rules

| # | Rule |
|---|---|
| **W1** | One word, one meaning. Use the same term for the same thing everywhere. The project's terms are technical names and are allowed: the canonical titles in `knowledge/`, product names, library names. |
| **W2** | Use simple verbs: do, make, use, show, set, add, remove, start, stop, make sure, get, give, send, open, close, find, change, select. The technical verbs are allowed: build, deploy, push, commit, upload, sign, merge, tag, release, install, run, test, record. Do not use vague verbs, for example "keep", "try", "handle", "leverage". |
| **W3** | A noun cluster has a maximum of 3 words. Break a longer one with "of" or "for", or with a relative clause. |
| **W4** | A procedural sentence (an instruction, a step) has a maximum of 20 words. A descriptive sentence has a maximum of 25 words. |
| **W5** | Write one instruction in one sentence. Use numbered steps for a procedure. Split a step with more than one action into sub-steps. |
| **W6** | Use the imperative for instructions: "Open the settings.", not "The settings should be opened.". |
| **W7** | Use the active voice. Name who does the action: "The app shows the list.", not "The list is shown.". |
| **W8** | Do not use -ing forms, except in technical names. Use the present tense for facts: "The app shows", not "The app will show". |
| **W9** | Start a warning with the command and a condition with the condition: "Do not X." / "If X, do Y.". |
| **W10** | A paragraph has a maximum of 6 sentences and one topic. |

Never remove a fact when you simplify. Every number, unit, date, name, path, link, rule
code, decision and reason stays. If you are not sure what a sentence means, do not guess:
write it as the source says it.

## Per kind of text

| Text | What STE-lite means there |
|---|---|
| Gherkin steps | One action or event in each `When`. Present tense in every step: "Then the list shows 3 plants", not "will show". No -ing forms. `Then` names an observable result. |
| `Rule:` lines and feature descriptions | One rule in one sentence, a maximum of 25 words. Use the knowledge terms (W1). |
| `capability.md`, concept bodies, intent and mapping text | Descriptive sentences of 25 words or less, one topic for each paragraph. |
| Release notes | Short, positive, factual. One change in one sentence, present tense: "You can now export a list.". |
| Store texts | Descriptive sentences of 25 words or less. The store's own limits and rules stay first. |
| Review notes, first-release checklist, hand-over steps | Numbered steps, one action in each step, 20 words or less, imperative. |

## Words to replace

| Do not use | Use |
|---|---|
| keep (vague) | stay, continue, store, do not change |
| try | attempt, test |
| handle | process, do, control |
| leverage, utilize | use |
| ensure | make sure |
| perform, carry out | do |
| should, needs to be (instruction) | the imperative, or "must" |
| will (for a present fact) | the present tense |
| via | through, with |
| prior to | before |
| in order to | to |
| e.g. / i.e. | for example / that is |

The validators of features and knowledge report a sentence that breaks W4, W6 or W8 as a
**warning**, never as an error. They skip files that are not in English.
