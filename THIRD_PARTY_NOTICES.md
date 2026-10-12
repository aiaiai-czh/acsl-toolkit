# Third-party notices

ACSL Toolkit's original implementation is distributed under the MIT License in
[`LICENSE`](LICENSE). The notice below covers vocabulary data derived from
third-party reference material and does not replace the MIT terms for original
implementation code.

## ACSL language specification

The vocabulary used to generate the bundled completion data and grammar was
independently selected, classified, and reorganized from the official language
specification. Its reviewable source form is published in the repository under
`data/acsl/1.24/`:

- Work: *ACSL: ANSI/ISO C Specification Language*, version 1.24
- Authors: Patrick Baudin, Pascal Cuoq, Jean-Christophe Filliâtre, Claude
  Marché, Benjamin Monate, Yannick Moy, and Virgile Prevosto, with subsequent
  contributions recorded by the ACSL project
- Copyright holder notice: Inria
- Source: <https://github.com/acsl-language/acsl/tree/1.24>
- Release: tag `1.24`, commit
  `585d28a206a7f7b06987292153cc02ca16b670ba` (short form `585d28a`)
- License: [Creative Commons Attribution 4.0 International
  (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/)

Changes made for ACSL Toolkit: vocabulary entries were extracted as individual
identifiers, grouped for editor completion and syntax highlighting, assigned
original short descriptions, and serialized in a project-specific JSON format.
Selected function signatures were reformatted as parameter-shaped editor
snippets after their arity and overloads were reviewed against the pinned
specification.
No claim of endorsement by the ACSL authors, CEA LIST, or Inria is made.

To the extent that the selected vocabulary data and its generated or bundled
representations contain material governed by CC BY 4.0, those portions remain
subject to CC BY 4.0. The source URL, release identifier, attribution, license,
and modification statement must remain with redistributed copies. The MIT
License does not override those third-party rights.
